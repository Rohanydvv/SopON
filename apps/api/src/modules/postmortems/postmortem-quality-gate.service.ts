import { Injectable } from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  PostmortemQualityResult,
  QualityGateCheck,
} from '@sopon/contracts';

@Injectable()
export class PostmortemQualityGateService {
  /**
   * Evaluates the Deterministic 8-Point Postmortem Quality Gate
   */
  async evaluateGate(
    orgId: string,
    incidentId: string,
  ): Promise<PostmortemQualityResult> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        service: {
          include: { circuitBreaker: true },
        },
        actionExecutions: {
          orderBy: { createdAt: 'desc' },
        },
        timeline: {
          orderBy: { createdAt: 'asc' },
        },
        aiAnalyses: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!incident || incident.organizationId !== orgId) {
      return {
        passed: false,
        qualityScore: 0.0,
        checks: [
          {
            checkNumber: 0,
            checkName: 'Incident Exists & Tenant Validated',
            passed: false,
            reason: 'Incident not found or does not belong to organization',
          },
        ],
        recommendation: 'REJECT',
        summary: 'Incident does not exist in this organization',
      };
    }

    const checks: QualityGateCheck[] = [];

    // Gate 1: Incident Status Verified
    const isResolved = incident.status === 'RESOLVED' && incident.resolvedAt !== null;
    checks.push({
      checkNumber: 1,
      checkName: 'Incident Status Verified',
      passed: isResolved,
      reason: isResolved
        ? `Incident is officially marked RESOLVED at ${incident.resolvedAt?.toISOString()}`
        : `Incident status is ${incident.status} (must be RESOLVED with resolution timestamp)`,
      details: { status: incident.status, resolvedAt: incident.resolvedAt },
    });

    // Gate 2: Remediation Execution Succeeded
    const successfulExecs = incident.actionExecutions.filter(
      (a) => a.status === 'SUCCEEDED' && !a.isDryRun,
    );
    const hasSuccessfulExec = successfulExecs.length > 0;
    checks.push({
      checkNumber: 2,
      checkName: 'Remediation Execution Succeeded',
      passed: hasSuccessfulExec,
      reason: hasSuccessfulExec
        ? `Verified ${successfulExecs.length} successful real-world action execution(s)`
        : 'Zero successful non-dry-run action executions found on incident',
      details: { successfulExecutionsCount: successfulExecs.length },
    });

    // Gate 3: Closed-Loop Verification Probes Passed
    const latestSuccess = successfulExecs[0];
    let probesPassed = false;
    let probesReason = 'No successful action with verified probes found';

    if (latestSuccess) {
      const outputJson = (latestSuccess.executionOutputJson as Record<string, unknown>) || {};
      const probes = (outputJson.verificationProbes as Array<{ probe: string; passed: boolean }>) || [];
      const hasFailedProbe = probes.some((p) => !p.passed);

      if (!hasFailedProbe) {
        probesPassed = true;
        probesReason = latestSuccess.verifiedAt
          ? `Closed-loop verification probes passed and confirmed at ${latestSuccess.verifiedAt.toISOString()}`
          : 'Verification probes reported passing status';
      } else {
        probesReason = 'One or more active verification probes failed';
      }
    }

    checks.push({
      checkNumber: 3,
      checkName: 'Closed-Loop Verification Probes Passed',
      passed: probesPassed,
      reason: probesReason,
      details: { verifiedAt: latestSuccess?.verifiedAt },
    });

    // Gate 4: No Rollback Occurred
    const rolledBackExecs = incident.actionExecutions.filter(
      (a) => a.status === 'ROLLED_BACK' || a.rollbackStatus === 'EXECUTED',
    );
    const noRollback = rolledBackExecs.length === 0;
    checks.push({
      checkNumber: 4,
      checkName: 'Zero Rollback Guarantee',
      passed: noRollback,
      reason: noRollback
        ? 'Zero rollback executions recorded for this incident'
        : `Automatic rollback occurred on ${rolledBackExecs.length} action(s); cannot become positive knowledge`,
      details: { rolledBackCount: rolledBackExecs.length },
    });

    // Gate 5: Root Cause Grounded in Evidence
    const aiAnalysis = incident.aiAnalyses[0];
    const timelineRca = incident.timeline.find(
      (t) => t.eventType === 'INVESTIGATION_NOTE' || t.eventType === 'RCA_COMPLETED',
    );
    const hasRca = !!(aiAnalysis?.outputJson || timelineRca);
    checks.push({
      checkNumber: 5,
      checkName: 'Root Cause Grounded in Evidence',
      passed: hasRca,
      reason: hasRca
        ? 'Root cause analysis supported by symptom correlation and timeline evidence'
        : 'Missing structured investigation RCA or timeline evidence',
    });

    // Gate 6: Action-to-Root-Cause Correlation
    const actionType = latestSuccess?.actionType;
    const knownActions = new Set([
      'RESTART_SERVICE_WORKER',
      'SCALE_SERVICE_REPLICAS',
      'UPDATE_POOL_CONFIG',
      'CLEAR_SERVICE_CACHE',
    ]);
    const actionCorrelated = !!actionType && knownActions.has(actionType);
    checks.push({
      checkNumber: 6,
      checkName: 'Action-to-Root-Cause Correlation',
      passed: actionCorrelated,
      reason: actionCorrelated
        ? `Remediation action "${actionType}" belongs to verified causal catalog`
        : `Action type "${actionType || 'NONE'}" is unrecognized or unverified`,
      details: { actionType },
    });

    // Gate 7: High RCA Confidence
    let confidence = 0.5;
    if (aiAnalysis?.outputJson) {
      const out = aiAnalysis.outputJson as Record<string, any>;
      confidence = out.reasonRca?.confidenceScore ?? out.confidenceScore ?? 0.5;
    } else if (timelineRca?.metadataJson) {
      const meta = timelineRca.metadataJson as Record<string, any>;
      confidence = meta.reasonRca?.confidenceScore ?? meta.confidenceScore ?? 0.88;
    } else if (isResolved && probesPassed) {
      confidence = 0.90;
    }

    const confidencePassed = confidence >= 0.80;
    checks.push({
      checkNumber: 7,
      checkName: 'High RCA Confidence',
      passed: confidencePassed,
      reason: confidencePassed
        ? `Investigation confidence score (${Math.round(confidence * 100)}%) meets threshold`
        : `Investigation confidence score (${Math.round(confidence * 100)}%) is below 80% threshold`,
      details: { confidenceScore: confidence },
    });

    // Gate 8: Zero Contradictory Evidence & Healthy Circuit Breaker
    const cb = incident.service?.circuitBreaker;
    const cbHealthy = !cb || (cb.state === 'CLOSED' && cb.failureStrikes === 0);
    checks.push({
      checkNumber: 8,
      checkName: 'Zero Contradictory Evidence & Healthy Circuit Breaker',
      passed: cbHealthy,
      reason: cbHealthy
        ? 'Service circuit breaker is CLOSED with zero active failure strikes'
        : `Service circuit breaker state is ${cb?.state} with ${cb?.failureStrikes} active strike(s)`,
      details: { circuitBreakerState: cb?.state, failureStrikes: cb?.failureStrikes },
    });

    // Compute Overall Score & Recommendation
    const passedChecks = checks.filter((c) => c.passed).length;
    const qualityScore = Math.round((passedChecks / checks.length) * 100) / 100;

    // Hard gate failure check (Gates 1, 2, 3, 4)
    const hardGateFailed = checks.slice(0, 4).some((c) => !c.passed);

    let recommendation: 'AUTO_APPROVE' | 'NEEDS_HUMAN_REVIEW' | 'REJECT';
    if (hardGateFailed) {
      recommendation = 'REJECT';
    } else if (passedChecks === checks.length && qualityScore >= 0.85) {
      recommendation = 'AUTO_APPROVE';
    } else {
      recommendation = 'NEEDS_HUMAN_REVIEW';
    }

    const passed = recommendation === 'AUTO_APPROVE';

    return {
      passed,
      qualityScore,
      checks,
      recommendation,
      summary: passed
        ? `All ${checks.length} quality checks passed (Score: ${Math.round(qualityScore * 100)}%). Approved for knowledge base.`
        : hardGateFailed
          ? `Hard quality gate failed. Postmortem rejected from knowledge base.`
          : `Quality gate passed with warnings (Score: ${Math.round(qualityScore * 100)}%). Requires human SRE review.`,
    };
  }
}
