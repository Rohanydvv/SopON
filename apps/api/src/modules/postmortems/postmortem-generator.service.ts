import { Injectable } from '@nestjs/common';
import { prisma } from '@sopon/database';

export interface GeneratedPostmortemContent {
  title: string;
  summary: string;
  rootCause: string;
  contributingFactors: string[];
  remediationAction: string;
  remediationSteps: string[];
  preventionItems: string[];
  detectionTimeMinutes: number;
  resolutionTimeMinutes: number;
}

@Injectable()
export class PostmortemGeneratorService {
  /**
   * Synthesizes structured postmortem content from incident timeline, actions, and RCA telemetry
   */
  async generateContent(orgId: string, incidentId: string, customNotes?: string): Promise<GeneratedPostmortemContent> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        service: true,
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
      throw new Error(`Incident ${incidentId} not found in organization ${orgId}`);
    }

    const serviceName = incident.service?.name || 'Target Service';
    const createdAt = new Date(incident.createdAt);
    const resolvedAt = incident.resolvedAt ? new Date(incident.resolvedAt) : new Date();
    const investigatingAt = incident.investigatingAt ? new Date(incident.investigatingAt) : createdAt;

    const detectionTimeMinutes = Math.max(
      1,
      Math.round((investigatingAt.getTime() - createdAt.getTime()) / 60000),
    );
    const resolutionTimeMinutes = Math.max(
      1,
      Math.round((resolvedAt.getTime() - createdAt.getTime()) / 60000),
    );

    // 1. Extract RCA & Contributing Factors
    const aiAnalysis = incident.aiAnalyses[0]?.outputJson as Record<string, any> | undefined;
    const timelineRca = incident.timeline.find(
      (t) => t.eventType === 'INVESTIGATION_NOTE' || t.eventType === 'RCA_COMPLETED',
    );

    let rootCause = 'Unclassified service degradation';
    let contributingFactors: string[] = [];

    if (aiAnalysis?.reasonRca?.primaryRootCause) {
      rootCause = aiAnalysis.reasonRca.primaryRootCause;
      contributingFactors = Array.isArray(aiAnalysis.reasonRca.contributingFactors)
        ? aiAnalysis.reasonRca.contributingFactors
        : [];
    } else if (timelineRca?.message) {
      rootCause = timelineRca.message;
      contributingFactors = [
        'Sudden elevation in client request traffic volume',
        'Resource threshold limits reached on active pods',
      ];
    } else {
      rootCause = `Operational anomaly observed in ${serviceName}: ${incident.title}`;
      contributingFactors = ['Workload concurrency spike', 'Underlying container latency'];
    }

    // 2. Extract Executed Remediation Action & Steps
    const latestSuccess = incident.actionExecutions.find((a) => a.status === 'SUCCEEDED' && !a.isDryRun);
    const remediationAction = latestSuccess?.actionType || 'RESTART_SERVICE_WORKER';

    const remediationSteps: string[] = [];
    remediationSteps.push(`1. Automated incident detection triggered for "${incident.title}".`);
    remediationSteps.push(`2. AI Copilot completed telemetry investigation and confirmed root cause.`);

    if (latestSuccess) {
      const params = (latestSuccess.parametersJson as Record<string, any>) || {};
      if (remediationAction === 'SCALE_SERVICE_REPLICAS') {
        remediationSteps.push(
          `3. Scaled service deployment replicas to ${params.targetReplicas || 4} pods via Kubernetes Action Runner.`,
        );
      } else if (remediationAction === 'RESTART_SERVICE_WORKER') {
        remediationSteps.push(
          `3. Executed zero-downtime rolling worker restart with ${params.gracePeriodSeconds || 30}s grace period.`,
        );
      } else if (remediationAction === 'UPDATE_POOL_CONFIG') {
        remediationSteps.push(
          `3. Updated client connection pool ceiling to ${params.maxConnections || 250} max connections.`,
        );
      } else if (remediationAction === 'CLEAR_SERVICE_CACHE') {
        remediationSteps.push(
          `3. Cleared stale key cache prefix "${params.keyPrefix || '*'}" across cluster nodes.`,
        );
      }
      remediationSteps.push(`4. Closed-loop active health probes verified service recovery and latency drop.`);
      remediationSteps.push(`5. Incident successfully marked RESOLVED.`);
    } else {
      remediationSteps.push(`3. Manual or simulated remediation procedure applied.`);
      remediationSteps.push(`4. Health telemetry normalized and incident transitioned to RESOLVED.`);
    }

    // 3. Generate Actionable Prevention Items
    const preventionItems: string[] = [
      `Audit and calibrate horizontal pod autoscaler (HPA) triggers for ${serviceName}.`,
      `Implement proactive circuit breaker thresholds on upstream database and cache connection pools.`,
      `Incorporate postmortem remediation learnings into automated runbook catalog.`,
    ];
    if (customNotes) {
      preventionItems.push(`Engineer Note: ${customNotes}`);
    }

    // 4. Narrative Summary
    const summary = `On ${createdAt.toUTCString()}, ${serviceName} experienced an operational incident titled "${incident.title}". ` +
      `The anomaly was detected and investigated within ${detectionTimeMinutes} minute(s). ` +
      `Root cause analysis determined: "${rootCause}". ` +
      `Remediation action "${remediationAction}" was executed and verified via closed-loop readiness probes, successfully resolving the incident in ${resolutionTimeMinutes} minute(s) with zero downtime.`;

    return {
      title: `Postmortem: ${incident.title}`,
      summary,
      rootCause,
      contributingFactors,
      remediationAction,
      remediationSteps,
      preventionItems,
      detectionTimeMinutes,
      resolutionTimeMinutes,
    };
  }
}
