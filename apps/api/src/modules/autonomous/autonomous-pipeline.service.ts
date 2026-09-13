import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { prisma } from '@sopon/database';
import {
  ActionType,
  AutonomyEvaluationResult,
  AutonomyGateCheck,
  AutonomousTriggerResult,
  ErrorCodes,
  IncidentAnalysisResponse,
} from '@sopon/contracts';
import { CopilotService } from '../copilot/copilot.service';
import { ActionsService } from '../actions/actions.service';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { getActionRunner } from '../actions/runners/action-registry';

const ALLOWLISTED_ACTIONS = new Set<string>([
  'RESTART_SERVICE_WORKER',
  'SCALE_SERVICE_REPLICAS',
  'CLEAR_SERVICE_CACHE',
  'UPDATE_POOL_CONFIG',
]);

@Injectable()
export class AutonomousPipelineService {
  constructor(
    private readonly copilotService: CopilotService,
    private readonly actionsService: ActionsService,
    private readonly circuitBreakerService: CircuitBreakerService,
  ) {}

  /**
   * Evaluates the 10-Point Autonomy Authority Matrix for an incident.
   */
  async evaluateAutonomyMatrix(
    orgId: string,
    incidentId: string,
    analysis?: IncidentAnalysisResponse,
  ): Promise<AutonomyEvaluationResult> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { service: true },
    });

    if (!incident || incident.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.INCIDENT_NOT_FOUND,
        message: 'Incident not found in organization',
      });
    }

    // If analysis not provided, generate or fetch it
    if (!analysis) {
      analysis = await this.copilotService.analyzeIncident(orgId, incidentId);
    }

    const service = incident.service;
    const policy = await this.actionsService.getOrCreatePolicy(orgId);
    const gateChecks: AutonomyGateCheck[] = [];

    // Gate 1: RCA Confidence Threshold (>= 0.85)
    const confidenceScore = analysis.reasonRca.confidenceScore;
    const confidencePassed = confidenceScore >= 0.85;
    gateChecks.push({
      gateNumber: 1,
      gateName: 'RCA Confidence Threshold (>= 0.85)',
      passed: confidencePassed,
      reason: confidencePassed
        ? `Confidence score is ${Math.round(confidenceScore * 100)}%`
        : `Confidence score ${Math.round(confidenceScore * 100)}% is below 85% threshold`,
      details: { confidenceScore },
    });

    // Gate 2: Grounded Runbook Match (>= 0.60)
    const docs = analysis.retrieve?.documents || [];
    const topDoc = docs[0];
    const topSopScore = topDoc?.relevanceScore || 0;
    const sopPassed = topSopScore >= 0.60;
    gateChecks.push({
      gateNumber: 2,
      gateName: 'Grounded Runbook Match (>= 0.60)',
      passed: sopPassed,
      reason: sopPassed
        ? `Top matched runbook "${topDoc?.title || 'Runbook'}" relevance is ${Math.round(topSopScore * 100)}%`
        : `Top runbook relevance ${Math.round(topSopScore * 100)}% is below 60% threshold`,
      details: { topSopScore, matchedSops: docs.length },
    });

    // Gate 3: Allowlisted Action Type
    const proposedActionRaw = analysis.decidePlan?.actions?.[0]?.actionType || 'RESTART_POD';
    let proposedAction: ActionType = 'RESTART_SERVICE_WORKER';
    if (proposedActionRaw === 'SCALE_SERVICE') {
      proposedAction = 'SCALE_SERVICE_REPLICAS';
    } else if (proposedActionRaw === 'CLEAR_CACHE') {
      proposedAction = 'CLEAR_SERVICE_CACHE';
    } else if (proposedActionRaw === 'CONFIG_UPDATE') {
      proposedAction = 'UPDATE_POOL_CONFIG';
    } else if (proposedActionRaw === 'RESTART_POD') {
      proposedAction = 'RESTART_SERVICE_WORKER';
    }

    const actionTypeAllowed = ALLOWLISTED_ACTIONS.has(proposedAction);
    gateChecks.push({
      gateNumber: 3,
      gateName: 'Allowlisted Action Type',
      passed: actionTypeAllowed,
      reason: actionTypeAllowed
        ? `Action type "${proposedAction}" is in approved allowlist`
        : `Action type "${proposedAction}" is not in approved allowlist`,
      details: { proposedAction, allowlist: Array.from(ALLOWLISTED_ACTIONS) },
    });

    // Gate 4: Organization Remediation Policy Enabled
    const orgPolicyEnabled = policy.autonomousRemediationEnabled && policy.allowedActionTypes.includes(proposedAction);
    gateChecks.push({
      gateNumber: 4,
      gateName: 'Organization Remediation Policy Enabled',
      passed: orgPolicyEnabled,
      reason: orgPolicyEnabled
        ? 'Autonomous remediation enabled and action permitted in policy'
        : 'Action disallowed by organization policy or remediation disabled',
      details: { policyAllowedActions: policy.allowedActionTypes },
    });

    // Gate 5: Environment & Approval Policy
    const isProduction = service?.environment === 'PRODUCTION';
    const requiresApproval = isProduction && policy.requireApprovalForProduction;
    const envApprovalPassed = !requiresApproval;
    gateChecks.push({
      gateNumber: 5,
      gateName: 'Environment & Approval Policy Clearance',
      passed: envApprovalPassed,
      reason: requiresApproval
        ? 'Production environment requires explicit human approval per organization policy'
        : `Autonomous execution permitted for environment "${service?.environment || 'STAGING'}"`,
      details: { environment: service?.environment, requireApprovalForProduction: policy.requireApprovalForProduction },
    });

    // Extract action parameters
    const actionParameters: Record<string, unknown> = {
      serviceSlug: service?.slug || 'service',
      serviceId: service?.id,
    };
    if (proposedAction === 'SCALE_SERVICE_REPLICAS') {
      actionParameters.targetReplicas = 4;
      actionParameters.reason = 'Scale replicas to handle elevated incident load';
    } else if (proposedAction === 'RESTART_SERVICE_WORKER') {
      actionParameters.gracePeriodSeconds = 30;
      actionParameters.reason = 'Graceful worker restart';
    }

    // Gate 6: Blast-Radius Safety Bounds
    let blastRadiusPassed = true;
    let blastRadiusReason = 'Action parameters within blast-radius bounds';
    if (proposedAction === 'SCALE_SERVICE_REPLICAS') {
      const targetReplicas = actionParameters.targetReplicas as number || 2;
      if (targetReplicas > 20) {
        blastRadiusPassed = false;
        blastRadiusReason = `Target replicas (${targetReplicas}) exceeds absolute ceiling of 20 pods`;
      }
    }
    gateChecks.push({
      gateNumber: 6,
      gateName: 'Blast-Radius Safety Bounds',
      passed: blastRadiusPassed,
      reason: blastRadiusReason,
      details: { parameters: actionParameters },
    });

    // Gate 7: Preconditions & Cluster Health Checks
    let preconditionPassed = true;
    let preconditionReason = 'Service exists and preconditions validated';
    if (!service) {
      preconditionPassed = false;
      preconditionReason = 'Target service does not exist';
    } else {
      try {
        const runner = getActionRunner(proposedAction);
        const validatedParams = runner.validateParams(actionParameters);
        const checks = await runner.checkPreconditions(validatedParams, service);
        const failedCheck = checks.find((c: any) => !c.passed);
        if (failedCheck) {
          preconditionPassed = false;
          preconditionReason = failedCheck.reason || failedCheck.check;
        }
      } catch (err: any) {
        preconditionPassed = false;
        preconditionReason = err.message;
      }
    }
    gateChecks.push({
      gateNumber: 7,
      gateName: 'Preconditions & Cluster Health Checks',
      passed: preconditionPassed,
      reason: preconditionReason,
    });

    // Gate 8: Persistent Flapping Circuit Breaker Status
    let cbPassed = true;
    let cbReason = 'Circuit breaker is CLOSED (healthy)';
    if (service) {
      const cbStatus = await this.circuitBreakerService.isActionAllowed(orgId, service.id);
      if (cbStatus.state === 'OPEN') {
        cbPassed = false;
        cbReason = cbStatus.reason || 'Circuit breaker is TRIPPED / OPEN';
      }
    }
    gateChecks.push({
      gateNumber: 8,
      gateName: 'Persistent Flapping Circuit Breaker Status',
      passed: cbPassed,
      reason: cbReason,
    });

    // Gate 9: Per-Service Cooldown Lock
    let cooldownPassed = true;
    let cooldownReason = 'Service is not in cooldown';
    if (service) {
      const cbStatus = await this.circuitBreakerService.isActionAllowed(orgId, service.id);
      if (cbStatus.isInCooldown) {
        cooldownPassed = false;
        cooldownReason = cbStatus.reason || 'Service in active cooldown window';
      }
    }
    gateChecks.push({
      gateNumber: 9,
      gateName: 'Per-Service Cooldown Lock',
      passed: cooldownPassed,
      reason: cooldownReason,
    });

    // Gate 10: Inactive Organization Kill Switch
    const killSwitchPassed = policy.autonomousRemediationEnabled;
    gateChecks.push({
      gateNumber: 10,
      gateName: 'Inactive Organization Kill Switch',
      passed: killSwitchPassed,
      reason: killSwitchPassed
        ? 'Kill switch is INACTIVE'
        : 'Kill switch is ACTIVE (Emergency stop engaged)',
    });

    const allPassed = gateChecks.every((g) => g.passed);
    const failedGates = gateChecks.filter((g) => !g.passed);
    const blockedReason = failedGates.length > 0
      ? failedGates.map((g) => `[Gate ${g.gateNumber}: ${g.gateName}] ${g.reason}`).join('; ')
      : undefined;

    return {
      incidentId,
      serviceId: service?.id || null,
      eligible: allPassed,
      actionType: proposedAction,
      actionParameters,
      requiresApproval,
      blockedReason,
      gateChecks,
    };
  }

  /**
   * Executes the full autonomous trigger pipeline from alert to resolution or rollback.
   */
  async processIncident(
    orgId: string,
    incidentId: string,
    actorUserId?: string,
    failVerificationProbe = false,
  ): Promise<AutonomousTriggerResult> {
    const analysis = await this.copilotService.analyzeIncident(orgId, incidentId, actorUserId);
    const evaluation = await this.evaluateAutonomyMatrix(orgId, incidentId, analysis);

    // If Approval is required per Gate 5 (e.g. Production environment)
    if (evaluation.requiresApproval) {
      const pendingExec = await this.actionsService.executeAction(
        orgId,
        incidentId,
        {
          actionType: evaluation.actionType as any,
          parameters: evaluation.actionParameters || {},
          targetServiceId: evaluation.serviceId || undefined,
        },
        actorUserId,
        false, // bypassApprovalCheck = false -> will queue as PENDING_APPROVAL
      );

      return {
        incidentId,
        triggered: false,
        status: 'PENDING_APPROVAL',
        actionExecutionId: pendingExec.id,
        message: 'Action queued for human approval per production remediation policy',
        evaluation,
      };
    }

    // If any other gate failed, execution is BLOCKED
    if (!evaluation.eligible || !evaluation.actionType) {
      await prisma.incidentTimeline.create({
        data: {
          incidentId,
          eventType: 'AUTONOMOUS_EXECUTION_BLOCKED',
          message: `Autonomous execution blocked by Autonomy Authority Matrix: ${evaluation.blockedReason}`,
          metadataJson: { evaluation } as any,
          actorUserId,
        },
      });

      return {
        incidentId,
        triggered: false,
        status: 'BLOCKED',
        message: evaluation.blockedReason || 'Autonomous execution ineligible',
        evaluation,
      };
    }

    // All 10 Gates Passed: Execute Autonomous Flow
    const serviceId = evaluation.serviceId!;
    const ownerToken = `worker_lock_${crypto.randomBytes(16).toString('hex')}`;

    // 1. Dry Run Simulation (Zero Mutation Guarantee)
    const dryRun = await this.actionsService.dryRunAction(orgId, incidentId, {
      actionType: evaluation.actionType as any,
      parameters: evaluation.actionParameters || {},
      targetServiceId: serviceId,
    });

    if (dryRun.status !== 'SUCCEEDED') {
      return {
        incidentId,
        triggered: false,
        status: 'BLOCKED',
        message: `Dry-run simulation failed: ${dryRun.errorMessage}`,
        evaluation,
      };
    }

    // 2. Acquire Distributed Service Lock with TTL & Fencing
    const lock = await this.circuitBreakerService.acquireServiceLock(orgId, serviceId, ownerToken, 120000);
    if (!lock.acquired) {
      await prisma.incidentTimeline.create({
        data: {
          incidentId,
          eventType: 'AUTONOMOUS_EXECUTION_BLOCKED',
          message: `Blocked by concurrency lock: ${lock.reason}`,
          metadataJson: { lockReason: lock.reason } as any,
          actorUserId,
        },
      });

      return {
        incidentId,
        triggered: false,
        status: 'BLOCKED',
        message: lock.reason || 'Concurrent action in progress on service',
        evaluation,
      };
    }

    try {
      // 3. Verify worker still holds lock before dispatching mutation
      const stillOwner = await this.circuitBreakerService.verifyLockOwnership(
        serviceId,
        ownerToken,
        lock.fencingToken,
      );

      if (!stillOwner) {
        throw new Error('Lost distributed lock ownership prior to infrastructure mutation');
      }

      // 4. Dispatch Real Action Execution to Kubernetes Adapter with Vault Credentials
      const execution = await this.actionsService.executeAction(
        orgId,
        incidentId,
        {
          actionType: evaluation.actionType as any,
          parameters: evaluation.actionParameters || {},
          targetServiceId: serviceId,
        },
        actorUserId,
        true, // bypassApprovalCheck = true because all 10 gates were already verified
        failVerificationProbe,
      );

      // 5. Handle Execution Outcome
      if (execution.status === 'SUCCEEDED') {
        // Set persistent cooldown on service to prevent flapping
        await this.circuitBreakerService.setCooldown(orgId, serviceId);

        return {
          incidentId,
          triggered: true,
          status: 'RESOLVED',
          actionExecutionId: execution.id,
          message: `Autonomous remediation "${evaluation.actionType}" executed and verified successfully. Incident resolved.`,
          evaluation,
          executionOutput: execution.executionOutput as any,
        };
      }

      // If Verification Probes Failed -> Automated Rollback Executed
      if (execution.status === 'ROLLED_BACK') {
        // Record failure strike on persistent circuit breaker
        await this.circuitBreakerService.recordStrike(
          orgId,
          serviceId,
          execution.errorMessage || 'Post-execution verification failed; automatic rollback executed',
          execution.id,
        );

        // Set cooldown after failed attempt
        await this.circuitBreakerService.setCooldown(orgId, serviceId);

        return {
          incidentId,
          triggered: true,
          status: 'ROLLED_BACK',
          actionExecutionId: execution.id,
          message: `Verification probes failed. Automatic rollback executed. Escalated to on-call.`,
          evaluation,
          executionOutput: execution.executionOutput as any,
        };
      }

      return {
        incidentId,
        triggered: true,
        status: 'ESCALATED',
        actionExecutionId: execution.id,
        message: execution.errorMessage || 'Action execution completed with failure',
        evaluation,
      };
    } finally {
      // Safely release lock only by owner
      await this.circuitBreakerService.releaseServiceLock(orgId, serviceId, ownerToken);
    }
  }
}

