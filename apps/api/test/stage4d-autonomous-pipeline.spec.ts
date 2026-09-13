import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { prisma } from '@sopon/database';
import {
  IncidentSeverity,
  IncidentStatus,
  ServiceEnvironment,
  UserRole,
} from '@sopon/contracts';
import { CircuitBreakerService } from '../src/modules/circuit-breaker/circuit-breaker.service';
import { AutonomousPipelineService } from '../src/modules/autonomous/autonomous-pipeline.service';
import { AutonomousReconciliationService } from '../src/modules/autonomous/autonomous-reconciliation.service';

describe('Milestone 4D: Autonomous Trigger Pipeline & Flapping Circuit Breaker E2E Tests', () => {
  let app: NestFastifyApplication;
  let circuitBreakerService: CircuitBreakerService;
  let autonomousPipelineService: AutonomousPipelineService;
  let reconciliationService: AutonomousReconciliationService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );

    app.setGlobalPrefix('api');
    app.useGlobalFilters(new AllExceptionsFilter());
    app.useGlobalInterceptors(new TransformInterceptor());

    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    circuitBreakerService = moduleFixture.get<CircuitBreakerService>(CircuitBreakerService);
    autonomousPipelineService = moduleFixture.get<AutonomousPipelineService>(AutonomousPipelineService);
    reconciliationService = moduleFixture.get<AutonomousReconciliationService>(AutonomousReconciliationService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const timestamp = Date.now();
  let ownerAToken: string;
  let engineerAToken: string;
  let userAOrgId: string;
  let serviceAId: string;
  let serviceStagingId: string;
  let incidentAId: string;

  let ownerBToken: string;
  let userBOrgId: string;
  let serviceBId: string;

  describe('0. Multi-Tenant Organization, Service, and Knowledge Setup', () => {
    it('should setup Org A, Owner A, Engineer A, Services, and Redis/Worker SOP', async () => {
      // 1. Register Owner A
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4d_owner_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org A SRE Lead',
          organizationName: `Stage4D Tenant A ${timestamp}`,
        },
      });
      expect(regRes.statusCode).toBe(201);
      const regJson = JSON.parse(regRes.body);
      ownerAToken = regJson.data.tokens.accessToken;
      userAOrgId = regJson.data.activeOrganizationId;

      // 2. Register Engineer A
      const engRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4d_engineer_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org A Engineer',
          organizationName: `Stage4D Eng Tenant ${timestamp}`,
        },
      });
      expect(engRes.statusCode).toBe(201);
      const engJson = JSON.parse(engRes.body);
      engineerAToken = engJson.data.tokens.accessToken;
      const engineerUserId = engJson.data.user.id;

      // Add Engineer A as ENGINEER in Org A
      await prisma.membership.create({
        data: {
          organizationId: userAOrgId,
          userId: engineerUserId,
          role: UserRole.ENGINEER,
        },
      });

      // 3. Create Production Service (Payment Checkout API)
      const srvProd = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Payment Checkout API',
          description: 'Production billing and checkout service',
          tier: 'Tier 1',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });
      expect(srvProd.statusCode).toBe(201);
      serviceAId = JSON.parse(srvProd.body).data.id;

      // 4. Create Staging Service (Staging Worker)
      const srvStaging = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Staging Worker Service',
          description: 'Staging background jobs and workers',
          tier: 'Tier 2',
          environment: ServiceEnvironment.STAGING,
        },
      });
      expect(srvStaging.statusCode).toBe(201);
      serviceStagingId = JSON.parse(srvStaging.body).data.id;

      // 5. Store Kubeconfig in KMS Vault
      const kubeconfigYaml = `
apiVersion: v1
clusters:
- cluster:
    server: https://k8s.stage4d.internal:6443
  name: prod-k8s
contexts:
- context:
    cluster: prod-k8s
    user: sopon-deployer
  name: prod
current-context: prod
users:
- name: sopon-deployer
  user:
    token: k8s-secret-service-token-stage4d
      `.trim();

      await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Production K8s Cluster Token',
          targetType: 'KUBERNETES',
          environment: ServiceEnvironment.PRODUCTION,
          serviceId: serviceAId,
          secretPayload: {
            kubeconfig: kubeconfigYaml,
            serverUrl: 'https://k8s.stage4d.internal:6443',
            serviceToken: 'k8s-secret-service-token-stage4d',
          },
        },
      });

      // 6. Ingest Grounded Runbook into Org A Knowledge Base
      const runbookContent = `
# Payment Checkout Redis Connection Pool & Replica Scaling Runbook

## Overview
Procedures when Payment Checkout API experiences HTTP 502/504 errors and client connection pool exhaustion.

## Diagnostic Symptoms
- HTTP 502 Bad Gateway spike
- Redis connection pool exhaustion
- Upstream 504 Gateway Timeout

## Remediation Steps
1. Inspect active connection pools
2. Scale service replicas up to 4 pods
3. Perform graceful worker restart
4. Verify HTTP 502 error rates drop below 0.05%
      `.trim();

      const docRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/documents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'Payment Checkout Redis Connection Pool & Replica Scaling Runbook',
          sourceType: 'RUNBOOK',
          content: runbookContent,
          tags: ['redis', 'scaling', 'payment', 'worker'],
        },
      });
      expect(docRes.statusCode).toBe(201);
    });

    it('should setup Org B for tenant isolation testing', async () => {
      const regB = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4d_userb_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org B Lead',
          organizationName: `Stage4D Tenant B ${timestamp}`,
        },
      });
      expect(regB.statusCode).toBe(201);
      const jsonB = JSON.parse(regB.body);
      ownerBToken = jsonB.data.tokens.accessToken;
      userBOrgId = jsonB.data.activeOrganizationId;

      const srvB = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userBOrgId}/services`,
        headers: { authorization: `Bearer ${ownerBToken}` },
        payload: {
          name: 'Org B Search',
          tier: 'Tier 2',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });
      expect(srvB.statusCode).toBe(201);
      serviceBId = JSON.parse(srvB.body).data.id;
    });
  });

  describe('1. 10-Point Autonomy Authority Matrix Evaluation', () => {
    it('Scenario 1: should enforce all 10 deterministic gates on Staging incident', async () => {
      // Declare Staging incident
      const incRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'HTTP 502 and Redis connection pool exhaustion on staging',
          description: 'Payment checkout worker experiencing 502 bad gateway spikes and connection pool starvation.',
          severity: IncidentSeverity.CRITICAL,
          serviceId: serviceStagingId,
        },
      });
      expect(incRes.statusCode).toBe(201);
      const stagingIncId = JSON.parse(incRes.body).data.id;

      const evalRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${stagingIncId}/autonomous/evaluate`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(evalRes.statusCode).toBe(200);
      const json = JSON.parse(evalRes.body);
      expect(json.data.gateChecks).toHaveLength(10);
      expect(json.data.gateChecks.every((g: any) => g.passed)).toBe(true);
      expect(json.data.eligible).toBe(true);
      expect(json.data.requiresApproval).toBe(false);
    });

    it('Scenario 2: should block autonomous execution when RCA confidence is low / novel incident', async () => {
      // Novel incident without matching runbook
      const incRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'Unexplained cosmic ray memory corruption in satellite sensor',
          description: 'Random bit flips observed in quantum crypto register.',
          severity: IncidentSeverity.LOW,
          serviceId: serviceStagingId,
        },
      });
      expect(incRes.statusCode).toBe(201);
      const novelIncId = JSON.parse(incRes.body).data.id;

      const evalRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${novelIncId}/autonomous/evaluate`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(evalRes.statusCode).toBe(200);
      const json = JSON.parse(evalRes.body);
      expect(json.data.eligible).toBe(false);
      // Gate 1 or Gate 2 must have failed
      const failedGates = json.data.gateChecks.filter((g: any) => !g.passed);
      expect(failedGates.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Safety Policies, Kill Switch & Production Approval Gates', () => {
    it('Scenario 3: should queue action as PENDING_APPROVAL by default for Production environment', async () => {
      // Ensure production approval policy is enabled
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/actions/policy`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          requireApprovalForProduction: true,
          autonomousRemediationEnabled: true,
        },
      });

      const incRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'HTTP 502 and Redis connection pool exhaustion on Payment Checkout',
          description: 'Payment Checkout API encountering critical socket starvation.',
          severity: IncidentSeverity.CRITICAL,
          serviceId: serviceAId,
        },
      });
      expect(incRes.statusCode).toBe(201);
      incidentAId = JSON.parse(incRes.body).data.id;

      // Trigger pipeline on Production incident
      const triggerRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/autonomous/trigger`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(triggerRes.statusCode).toBe(200);
      const json = JSON.parse(triggerRes.body);
      expect(json.data.triggered).toBe(false);
      expect(json.data.status).toBe('PENDING_APPROVAL');
      expect(json.data.message).toContain('human approval per production');

      // Verify incident is not prematurely resolved
      const incCheck = await prisma.incident.findUnique({ where: { id: incidentAId } });
      expect(incCheck!.status).not.toBe(IncidentStatus.RESOLVED);
    });

    it('Scenario 4: should immediately BLOCK execution when Organization Kill Switch is active', async () => {
      // Activate Emergency Kill Switch
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/actions/policy`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { autonomousRemediationEnabled: false },
      });

      const incRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'HTTP 502 and Redis connection pool exhaustion on Staging',
          description: 'High worker latency.',
          severity: IncidentSeverity.HIGH,
          serviceId: serviceStagingId,
        },
      });
      const incId = JSON.parse(incRes.body).data.id;

      const triggerRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incId}/autonomous/trigger`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(triggerRes.statusCode).toBe(200);
      const json = JSON.parse(triggerRes.body);
      expect(json.data.triggered).toBe(false);
      expect(json.data.status).toBe('BLOCKED');
      expect(json.data.message).toContain('Kill switch');

      // Restore Kill Switch for subsequent tests
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/actions/policy`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { autonomousRemediationEnabled: true },
      });
    });
  });

  describe('3. Distributed Concurrency, Locking & Cooldown Persistence', () => {
    it('Scenario 5: should block conflicting simultaneous action on the same service with distributed lock', async () => {
      const ownerToken1 = 'test_worker_alpha_token_1';
      const ownerToken2 = 'test_worker_beta_token_2';

      // 1. Worker Alpha acquires lock on service
      const lockAlpha = await circuitBreakerService.acquireServiceLock(
        userAOrgId,
        serviceStagingId,
        ownerToken1,
        60000,
      );
      expect(lockAlpha.acquired).toBe(true);

      // 2. Worker Beta attempts to acquire lock on the same service -> Must be REJECTED
      const lockBeta = await circuitBreakerService.acquireServiceLock(
        userAOrgId,
        serviceStagingId,
        ownerToken2,
        60000,
      );
      expect(lockBeta.acquired).toBe(false);
      expect(lockBeta.reason).toContain('Concurrent action in progress');

      // 3. Stale worker check: Worker Beta cannot release Worker Alpha's lock
      const releaseAttempt = await circuitBreakerService.releaseServiceLock(
        userAOrgId,
        serviceStagingId,
        ownerToken2,
      );
      expect(releaseAttempt).toBe(false);

      // 4. Worker Alpha releases its own lock
      const releaseSuccess = await circuitBreakerService.releaseServiceLock(
        userAOrgId,
        serviceStagingId,
        ownerToken1,
      );
      expect(releaseSuccess).toBe(true);
    });

    it('Scenario 6: should enforce persistent per-service cooldown across restart simulations', async () => {
      // Set cooldown on staging service (15 minutes)
      await circuitBreakerService.setCooldown(userAOrgId, serviceStagingId, 15);

      // Verify action is blocked due to cooldown
      const allowance = await circuitBreakerService.isActionAllowed(userAOrgId, serviceStagingId);
      expect(allowance.allowed).toBe(false);
      expect(allowance.isInCooldown).toBe(true);
      expect(allowance.reason).toContain('cooldown window');

      // Clear cooldown manually for subsequent tests
      await prisma.serviceCircuitBreaker.update({
        where: { serviceId: serviceStagingId },
        data: { cooldownEndsAt: null },
      });
    });
  });

  describe('4. Flapping Circuit Breaker, 3 Strikes & Manual Reset', () => {
    it('Scenario 7: should record failure strikes and trip circuit breaker to OPEN on 3 strikes', async () => {
      // Strike 1
      const strike1 = await circuitBreakerService.recordStrike(
        userAOrgId,
        serviceStagingId,
        'Simulated pod readiness failure 1',
      );
      expect(strike1.failureStrikes).toBe(1);
      expect(strike1.state).toBe('CLOSED');
      expect(strike1.tripped).toBe(false);

      // Strike 2
      const strike2 = await circuitBreakerService.recordStrike(
        userAOrgId,
        serviceStagingId,
        'Simulated probe timeout 2',
      );
      expect(strike2.failureStrikes).toBe(2);
      expect(strike2.state).toBe('CLOSED');

      // Strike 3 -> TRIPS TO OPEN
      const strike3 = await circuitBreakerService.recordStrike(
        userAOrgId,
        serviceStagingId,
        'Simulated verification failure 3',
      );
      expect(strike3.failureStrikes).toBe(3);
      expect(strike3.state).toBe('OPEN');
      expect(strike3.tripped).toBe(true);

      // Verify circuit breaker endpoint returns OPEN status
      const cbRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/services/${serviceStagingId}/circuit-breaker`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });
      expect(cbRes.statusCode).toBe(200);
      const json = JSON.parse(cbRes.body);
      expect(json.data.state).toBe('OPEN');
      expect(json.data.isActionAllowed).toBe(false);
      expect(json.data.failureStrikes).toBe(3);
    });

    it('Scenario 8: should BLOCK autonomous actions when circuit breaker is OPEN', async () => {
      const incRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'HTTP 502 and Redis connection pool exhaustion on Staging',
          description: 'Another repeat alert while circuit breaker is OPEN.',
          severity: IncidentSeverity.HIGH,
          serviceId: serviceStagingId,
        },
      });
      const incId = JSON.parse(incRes.body).data.id;

      const triggerRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incId}/autonomous/trigger`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(triggerRes.statusCode).toBe(200);
      const json = JSON.parse(triggerRes.body);
      expect(json.data.triggered).toBe(false);
      expect(json.data.status).toBe('BLOCKED');
      expect(json.data.message).toContain('TRIPPED / OPEN');
    });

    it('Scenario 9: should permit OWNER/ADMIN to manually reset circuit breaker with audited reason', async () => {
      // 1. Non-privileged user (ENGINEER) reset attempt -> 403 Forbidden
      const engReset = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services/${serviceStagingId}/circuit-breaker/reset`,
        headers: { authorization: `Bearer ${engineerAToken}` },
        payload: { reason: 'Engineer trying to reset circuit breaker' },
      });
      expect(engReset.statusCode).toBe(403);

      // 2. OWNER reset -> 200 OK
      const ownerReset = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services/${serviceStagingId}/circuit-breaker/reset`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { reason: 'Root cause fixed: Redis maxclients pool parameter enlarged to 10,000' },
      });
      expect(ownerReset.statusCode).toBe(200);
      const json = JSON.parse(ownerReset.body);
      expect(json.data.state).toBe('CLOSED');
      expect(json.data.failureStrikes).toBe(0);
      expect(json.data.isActionAllowed).toBe(true);

      // 3. Verify audit log entry
      const audit = await prisma.auditLog.findFirst({
        where: {
          organizationId: userAOrgId,
          action: 'CIRCUIT_BREAKER_RESET',
        },
        orderBy: { createdAt: 'desc' },
      });
      expect(audit).not.toBeNull();
      expect(JSON.stringify(audit!.metadataJson)).toContain('Redis maxclients');
    });
  });

  describe('5. Full End-to-End Autonomous Remediation & Rollback', () => {
    it('Scenario 10: should execute full autonomous pipeline and AUTO-RESOLVE on passing probes', async () => {
      // Create new staging incident with valid runbook symptoms
      const incRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'HTTP 502 and Redis connection pool exhaustion on Staging Worker',
          description: 'Payment checkout worker socket exhaustion under burst traffic.',
          severity: IncidentSeverity.CRITICAL,
          serviceId: serviceStagingId,
        },
      });
      expect(incRes.statusCode).toBe(201);
      const incId = JSON.parse(incRes.body).data.id;

      // Trigger autonomous pipeline
      const triggerRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incId}/autonomous/trigger`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(triggerRes.statusCode).toBe(200);
      const json = JSON.parse(triggerRes.body);
      expect(json.data.triggered).toBe(true);
      expect(json.data.status).toBe('RESOLVED');
      expect(json.data.evaluation.eligible).toBe(true);

      // Verify incident is marked RESOLVED in database
      const inc = await prisma.incident.findUnique({ where: { id: incId } });
      expect(inc!.status).toBe(IncidentStatus.RESOLVED);

      // Verify timeline events
      const timeline = await prisma.incidentTimeline.findMany({
        where: { incidentId: incId },
        orderBy: { createdAt: 'desc' },
      });
      expect(timeline.some((t) => t.eventType === 'REMEDIATION_EXECUTED')).toBe(true);
      expect(timeline.some((t) => t.eventType === 'INCIDENT_RESOLVED')).toBe(true);

      // Clear cooldown for subsequent rollback scenario
      await prisma.serviceCircuitBreaker.update({
        where: { serviceId: serviceStagingId },
        data: { cooldownEndsAt: null },
      });
    });

    it('Scenario 11: should trigger AUTOMATIC ROLLBACK when verification probes fail', async () => {
      const incRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'HTTP 502 and Redis connection pool exhaustion on Staging Worker Failure Test',
          description: 'Testing closed-loop automated rollback upon failed probes.',
          severity: IncidentSeverity.CRITICAL,
          serviceId: serviceStagingId,
        },
      });
      expect(incRes.statusCode).toBe(201);
      const incId = JSON.parse(incRes.body).data.id;

      // Trigger pipeline with simulated verification probe failure
      const result = await autonomousPipelineService.processIncident(
        userAOrgId,
        incId,
        undefined,
        true, // failVerificationProbe = true
      );

      expect(result.triggered).toBe(true);
      expect(result.status).toBe('ROLLED_BACK');
      expect(result.message).toContain('Automatic rollback executed');

      // Verify incident is NOT resolved
      const inc = await prisma.incident.findUnique({ where: { id: incId } });
      expect(inc!.status).not.toBe(IncidentStatus.RESOLVED);

      // Verify failure strike was recorded on circuit breaker
      const cb = await circuitBreakerService.getOrCreate(userAOrgId, serviceStagingId);
      expect(cb.failureStrikes).toBeGreaterThanOrEqual(1);

      // Clear cooldown for subsequent tests
      await prisma.serviceCircuitBreaker.update({
        where: { serviceId: serviceStagingId },
        data: { cooldownEndsAt: null },
      });
    });
  });

  describe('6. Conservative Crash Recovery & Stale Lock Reconciliation', () => {
    it('Scenario 12: should reconcile orphaned in-flight executions without blind replay', async () => {
      // 1. Create an orphaned execution in RUNNING state older than 5 minutes
      const oldDate = new Date(Date.now() - 10 * 60 * 1000);
      const orphanedExec = await prisma.actionExecution.create({
        data: {
          organizationId: userAOrgId,
          incidentId: incidentAId,
          actionType: 'SCALE_SERVICE_REPLICAS',
          riskTier: 'SAFE_AUTOMATIC',
          status: 'RUNNING',
          targetServiceId: serviceStagingId,
          parametersJson: { targetReplicas: 2, serviceSlug: 'staging-worker-service' },
          createdAt: oldDate,
          updatedAt: oldDate,
        },
      });

      // 2. Set an expired distributed lock on the service
      await prisma.serviceCircuitBreaker.update({
        where: { serviceId: serviceStagingId },
        data: {
          lockOwnerToken: 'crashed_worker_token_999',
          lockExpiresAt: oldDate,
        },
      });

      // 3. Run reconciliation
      const report = await reconciliationService.reconcileOrphanedExecutions(userAOrgId);
      expect(report.scannedCount).toBeGreaterThanOrEqual(1);
      expect(report.staleLocksCleared).toBeGreaterThanOrEqual(1);

      // 4. Verify orphaned execution was safely finalized (SUCCEEDED or FAILED) without blind replay
      const updatedExec = await prisma.actionExecution.findUnique({
        where: { id: orphanedExec.id },
      });
      expect(['SUCCEEDED', 'FAILED']).toContain(updatedExec!.status);

      // 5. Verify lock was cleared
      const cb = await circuitBreakerService.getOrCreate(userAOrgId, serviceStagingId);
      expect(cb.lockOwnerToken).toBeNull();
    });
  });

  describe('7. Strict Multi-Tenant Isolation & Zero Secret Exposure', () => {
    it('Scenario 13: should strictly forbid Org B from triggering actions or viewing Org A circuit breakers', async () => {
      // Org B attempts to view Org A circuit breaker
      const cbRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/services/${serviceAId}/circuit-breaker`,
        headers: { authorization: `Bearer ${ownerBToken}` },
      });
      expect(cbRes.statusCode).toBe(403);

      // Org A attempts to view Org B circuit breaker
      const cbBRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userBOrgId}/services/${serviceBId}/circuit-breaker`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });
      expect(cbBRes.statusCode).toBe(403);

      // Org B attempts to trigger remediation on Org A incident
      const triggerRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/autonomous/trigger`,
        headers: { authorization: `Bearer ${ownerBToken}` },
      });
      expect(triggerRes.statusCode).toBe(403);
    });

    it('Scenario 14: should verify ZERO SECRET LEAKAGE in timeline, executions, and audit records', async () => {
      const executions = await prisma.actionExecution.findMany({
        where: { organizationId: userAOrgId },
      });

      for (const exec of executions) {
        const outputStr = JSON.stringify(exec.executionOutputJson || {});
        expect(outputStr).not.toContain('k8s-secret-service-token-stage4d');
        expect(outputStr).not.toContain('super-secure-production-redis-password');
      }

      const timeline = await prisma.incidentTimeline.findMany({
        where: { incident: { organizationId: userAOrgId } },
      });

      for (const t of timeline) {
        const metaStr = JSON.stringify(t.metadataJson || {});
        expect(metaStr).not.toContain('k8s-secret-service-token-stage4d');
        expect(metaStr).not.toContain('super-secure-production-redis-password');
      }
    });
  });
});
