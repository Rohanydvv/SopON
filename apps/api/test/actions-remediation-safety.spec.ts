import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { prisma } from '@sopon/database';
import { IncidentSeverity, ServiceEnvironment } from '@sopon/contracts';

describe('Stage 3: Controlled Autonomous Remediation (ACT) Engine & Safety Gates E2E Tests', () => {
  let app: NestFastifyApplication;

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
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const timestamp = Date.now();
  let userAToken: string;
  let userAOrgId: string;

  let userBToken: string;

  let serviceProdId: string;
  let serviceStagingId: string;
  let incidentProdId: string;
  let incidentStagingId: string;

  describe('1. Setup Users, Services and Incidents', () => {
    it('should register User A with Org A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `usera_actions_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Lead SRE A',
          organizationName: `Org Actions A ${timestamp}`,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      userAToken = json.data.tokens.accessToken;
      userAOrgId = json.data.activeOrganizationId;
    });

    it('should register User B with Org B (for multi-tenant checks)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `userb_actions_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Lead SRE B',
          organizationName: `Org Actions B ${timestamp}`,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      userBToken = json.data.tokens.accessToken;
    });

    it('should create Production and Staging services in Org A', async () => {
      const resProd = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: 'Core Payment Service',
          description: 'Production billing engine',
          tier: 'Tier 1',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });
      expect(resProd.statusCode).toBe(201);
      serviceProdId = JSON.parse(resProd.body).data.id;

      const resStaging = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: 'Staging Payment Service',
          description: 'Staging billing engine',
          tier: 'Tier 2',
          environment: ServiceEnvironment.STAGING,
        },
      });
      expect(resStaging.statusCode).toBe(201);
      serviceStagingId = JSON.parse(resStaging.body).data.id;
    });

    it('should declare incidents for Production and Staging services', async () => {
      const resProdInc = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'High HTTP 504 on Payment Gateway',
          description: 'Redis connection pool exhaustion observed in worker cluster.',
          severity: IncidentSeverity.CRITICAL,
          serviceId: serviceProdId,
        },
      });
      expect(resProdInc.statusCode).toBe(201);
      incidentProdId = JSON.parse(resProdInc.body).data.id;

      const resStagingInc = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'Staging Worker Memory Leak',
          description: 'High memory usage in staging worker pods.',
          severity: IncidentSeverity.HIGH,
          serviceId: serviceStagingId,
        },
      });
      expect(resStagingInc.statusCode).toBe(201);
      incidentStagingId = JSON.parse(resStagingInc.body).data.id;
    });

    it('should ingest Payment Gateway Redis runbook in Org A', async () => {
      const markdownContent = `
# Payment Gateway Redis Connection Pool Runbook

## Overview
Remediation procedures when Payment Gateway encounters high latency or 502 errors due to worker socket starvation.

## Remediation Steps
1. Inspect active client connections with redis-cli info clients
2. Increase REDIS_MAX_CONNECTIONS pool parameter
3. Gracefully restart payment-gateway worker pods
4. Verify HTTP 502 error rates drop below 0.05%
      `.trim();

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/documents`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'Payment Gateway Redis Connection Pool Runbook',
          content: markdownContent,
          sourceType: 'RUNBOOK',
          serviceId: serviceStagingId,
        },
      });

      expect(res.statusCode).toBe(201);
    });
  });

  describe('2. Remediation Policy & Emergency Kill-Switch', () => {
    it('should initialize and retrieve default remediation policy', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/remediation-policy`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.autonomousRemediationEnabled).toBe(true);
      expect(json.data.allowedActionTypes).toContain('RESTART_SERVICE_WORKER');
      expect(json.data.allowedActionTypes).toContain('SCALE_SERVICE_REPLICAS');
    });

    it('should allow updating remediation policy', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/remediation-policy`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          maxConcurrentActions: 3,
          cooldownPeriodMinutes: 10,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.maxConcurrentActions).toBe(3);
      expect(json.data.cooldownPeriodMinutes).toBe(10);
    });

    it('should reject execution when emergency kill-switch is engaged', async () => {
      // 1. Engage kill-switch
      const killSwitchRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/remediation-policy`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          autonomousRemediationEnabled: false,
        },
      });
      expect(killSwitchRes.statusCode).toBe(200);
      expect(JSON.parse(killSwitchRes.body).data.autonomousRemediationEnabled).toBe(false);

      // 2. Attempt execution
      const execRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          parameters: {
            gracefulTimeoutSeconds: 30,
            drainConnections: true,
            reason: 'Kill-switch test attempt',
          },
        },
      });

      expect(execRes.statusCode).toBe(403);
      const errJson = JSON.parse(execRes.body);
      expect(errJson.error.code).toBe('REMEDIATION_DISABLED_BY_KILL_SWITCH');

      // 3. Re-enable autonomous remediation
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/remediation-policy`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          autonomousRemediationEnabled: true,
        },
      });
    });
  });

  describe('3. Action Registry & Parameter Validation', () => {
    it('should reject unregistered/unallowlisted action type', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'DROP_DATABASE_TABLE' as any,
          parameters: {},
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject invalid parameters (e.g. invalid type or bounds)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          parameters: {
            targetReplicas: 9999, // exceeds max bound 50
            reason: 'Scale test',
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('4. Dry-Run Simulation', () => {
    it('should simulate action without mutating infrastructure or closing incident', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/dry-run`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          targetServiceId: serviceStagingId,
          parameters: {
            gracefulTimeoutSeconds: 20,
            drainConnections: true,
            reason: 'Dry-run test restart',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.isDryRun).toBe(true);
      expect(json.data.status).toBe('SUCCEEDED');
      expect(json.data.preconditionChecks.length).toBeGreaterThan(0);
      expect(json.data.preconditionChecks.every((c: any) => c.passed)).toBe(true);
      expect(json.data.verificationResults.length).toBeGreaterThan(0);
      expect(json.data.executionOutput.simulated).toBe(true);

      // Verify incident remains OPEN / not auto-resolved by dry-run
      const incRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      expect(JSON.parse(incRes.body).data.status).toBe('OPEN');
    });
  });

  describe('5. Real Execution, Telemetry Verification & Closed-Loop Auto-Resolution', () => {
    it('should execute RESTART_SERVICE_WORKER, verify telemetry probes, and auto-resolve incident', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          targetServiceId: serviceStagingId,
          parameters: {
            gracefulTimeoutSeconds: 15,
            drainConnections: true,
            reason: 'Mitigate staging worker leak',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.isDryRun).toBe(false);
      expect(json.data.status).toBe('SUCCEEDED');
      expect(json.data.verificationResults).toBeDefined();
      expect(json.data.verificationResults.length).toBeGreaterThan(0);
      expect(json.data.verificationResults.every((v: any) => v.passed)).toBe(true);

      // Verify Incident is now automatically RESOLVED
      const incRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const incJson = JSON.parse(incRes.body);
      expect(incJson.data.status).toBe('RESOLVED');
      expect(incJson.data.resolvedAt).not.toBeNull();

      // Verify timeline events recorded REMEDIATION_EXECUTED and INCIDENT_RESOLVED
      const timelineRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/timeline`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const timeline = JSON.parse(timelineRes.body).data;
      const eventTypes = timeline.map((e: any) => e.eventType);
      expect(eventTypes).toContain('REMEDIATION_EXECUTED');
      expect(eventTypes).toContain('INCIDENT_RESOLVED');
    });

    it('should list all executed actions for the incident', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(Array.isArray(json.data)).toBe(true);
      expect(json.data.length).toBeGreaterThanOrEqual(2); // 1 dry-run + 1 real execute
    });
  });

  describe('6. Production Approval Gate & Operator Approval Workflow', () => {
    let pendingActionId: string;

    it('should require approval for production service when policy demands approval', async () => {
      // 1. Enable requireApprovalForProduction
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/remediation-policy`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          requireApprovalForProduction: true,
        },
      });

      // 2. Execute action targeting Production service
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentProdId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'UPDATE_POOL_CONFIG',
          targetServiceId: serviceProdId,
          parameters: {
            poolSize: 50,
            connectionTimeoutMs: 5000,
            idleTimeoutMs: 30000,
            reason: 'Expand pool capacity during traffic spike',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.status).toBe('PENDING_APPROVAL');
      expect(json.data.riskTier).toBe('REQUIRES_APPROVAL');
      pendingActionId = json.data.id;

      // Incident should NOT be resolved yet
      const incRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentProdId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      expect(JSON.parse(incRes.body).data.status).toBe('OPEN');
    });

    it('should allow authorized operator to approve and dispatch the pending action', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentProdId}/actions/${pendingActionId}/approve`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.status).toBe('SUCCEEDED');
      expect(json.data.verificationResults.every((v: any) => v.passed)).toBe(true);

      // Now Production incident should be automatically RESOLVED
      const incRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentProdId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      expect(JSON.parse(incRes.body).data.status).toBe('RESOLVED');
    });
  });

  describe('7. Safe Rollback Execution', () => {
    let scaleActionId: string;

    it('should execute SCALE_SERVICE_REPLICAS action', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          targetServiceId: serviceStagingId,
          parameters: {
            targetReplicas: 5,
            minReplicas: 2,
            maxReplicas: 10,
            reason: 'Scale up worker pool',
          },
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.status).toBe('SUCCEEDED');
      scaleActionId = json.data.id;
    });

    it('should trigger rollback for the action', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/${scaleActionId}/rollback`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.status).toBe('ROLLED_BACK');
      expect(json.data.rollbackStatus).toBe('EXECUTED');
    });
  });

  describe('8. Multi-Tenant Isolation Boundaries', () => {
    it('should forbid User B from accessing or executing remediation on Org A incident', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentProdId}/actions/execute`,
        headers: { authorization: `Bearer ${userBToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          parameters: {
            gracefulTimeoutSeconds: 15,
            drainConnections: true,
            reason: 'Cross-tenant breach attempt',
          },
        },
      });

      // 403 Forbidden because User B does not belong to Org A
      expect(res.statusCode).toBe(403);
    });

    it('should forbid User B from viewing Org A remediation policy', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/remediation-policy`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should forbid User B from dry-running or rolling back actions on Org A incident', async () => {
      const dryRunRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentProdId}/actions/dry-run`,
        headers: { authorization: `Bearer ${userBToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          parameters: { gracePeriodSeconds: 30 },
        },
      });
      expect(dryRunRes.statusCode).toBe(403);

      const rollbackRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentProdId}/actions/some-id/rollback`,
        headers: { authorization: `Bearer ${userBToken}` },
      });
      expect(rollbackRes.statusCode).toBe(403);
    });
  });

  describe('9. Precondition Failures & Policy Action-Type Restrictions', () => {
    it('should fail when target service does not exist in organization', async () => {
      const nonExistentServiceId = '00000000-0000-0000-0000-000000000000';
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          targetServiceId: nonExistentServiceId,
          parameters: {
            gracePeriodSeconds: 30,
            drainConnections: true,
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should fail when action type is disallowed by organization policy', async () => {
      // 1. Restrict policy to SCALE_SERVICE_REPLICAS only
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/remediation-policy`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          allowedActionTypes: ['SCALE_SERVICE_REPLICAS'],
        },
      });

      // 2. Attempt RESTART_SERVICE_WORKER
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          targetServiceId: serviceStagingId,
          parameters: {
            gracePeriodSeconds: 30,
            drainConnections: true,
          },
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('ACTION_TYPE_NOT_ALLOWED_BY_POLICY');

      // 3. Restore allowed actions
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/remediation-policy`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          allowedActionTypes: [
            'RESTART_SERVICE_WORKER',
            'SCALE_SERVICE_REPLICAS',
            'UPDATE_POOL_CONFIG',
            'CLEAR_SERVICE_CACHE',
          ],
        },
      });
    });
  });

  describe('10. Shell Injection Protection & Parameter Bounds', () => {
    it('should reject parameter payloads attempting shell injection or invalid characters', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          parameters: {
            serviceSlug: '; rm -rf / && echo pwned',
            gracePeriodSeconds: 'invalid-string' as any,
          },
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('should reject replica scaling when replicas exceed ceiling in runner preconditions', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentStagingId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          targetServiceId: serviceStagingId,
          parameters: {
            targetReplicas: 35, // Schema max is 50, but runner ceiling precondition is 20
            reason: 'High load burst',
          },
        },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('PRECONDITION_FAILED');
    });
  });

  describe('11. Secret Scrubbing & Audit Trail Integrity', () => {
    it('should verify database action executions and audit logs never store auth secrets or passwords', async () => {
      const executions = await prisma.actionExecution.findMany({
        where: { organizationId: userAOrgId },
      });

      expect(executions.length).toBeGreaterThan(0);

      for (const exec of executions) {
        const paramsStr = JSON.stringify(exec.parametersJson || {});
        const outputStr = JSON.stringify(exec.executionOutputJson || {});

        expect(paramsStr).not.toContain('Password123!');
        expect(paramsStr).not.toContain(userAToken);
        expect(outputStr).not.toContain('Password123!');
        expect(outputStr).not.toContain(userAToken);
      }

      const auditLogs = await prisma.auditLog.findMany({
        where: { organizationId: userAOrgId },
      });

      for (const log of auditLogs) {
        const metaStr = JSON.stringify(log.metadataJson || {});
        expect(metaStr).not.toContain('Password123!');
        expect(metaStr).not.toContain(userAToken);
      }
    });
  });

  describe('12. End-to-End Autonomous Remediation Lifecycle', () => {
    it('should execute full lifecycle: Analyze -> Plan -> Dry-Run -> Execute -> Verify -> Auto-Resolve', async () => {
      // 1. Create a fresh incident
      const incRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'HTTP 502 High Latency on Core Payment Service',
          description: 'Payment gateway returning 502 Bad Gateway due to worker socket starvation.',
          severity: IncidentSeverity.HIGH,
          serviceId: serviceStagingId,
        },
      });
      expect(incRes.statusCode).toBe(201);
      const newIncId = JSON.parse(incRes.body).data.id;

      // 2. Trigger Autonomous RCA
      const analyzeRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${newIncId}/analyze`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      expect(analyzeRes.statusCode).toBe(200);
      const analysisData = JSON.parse(analyzeRes.body).data;
      expect(analysisData.understand.detectedSymptoms.length).toBeGreaterThan(0);
      expect(analysisData.reasonRca.confidenceScore).toBeGreaterThanOrEqual(0.7);
      expect(analysisData.decidePlan.actions.length).toBeGreaterThan(0);

      // 3. Dry-Run the first planned remediation action
      const dryRunRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${newIncId}/actions/dry-run`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          targetServiceId: serviceStagingId,
          parameters: {
            gracePeriodSeconds: 20,
            drainConnections: true,
            reason: 'Simulate planned worker restart',
          },
        },
      });
      expect(dryRunRes.statusCode).toBe(200);
      expect(JSON.parse(dryRunRes.body).data.isDryRun).toBe(true);

      // Verify incident is still OPEN after dry-run
      const checkOpenRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${newIncId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      expect(JSON.parse(checkOpenRes.body).data.status).toBe('OPEN');

      // 4. Real Safe Execution
      const execRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${newIncId}/actions/execute`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          targetServiceId: serviceStagingId,
          parameters: {
            gracePeriodSeconds: 15,
            drainConnections: true,
            reason: 'Execute planned worker restart',
          },
        },
      });
      expect(execRes.statusCode).toBe(200);
      const execJson = JSON.parse(execRes.body).data;
      expect(execJson.status).toBe('SUCCEEDED');
      expect(execJson.verificationResults.every((p: any) => p.passed)).toBe(true);

      // 5. Closed-loop verification check: Incident should now be automatically RESOLVED
      const checkResolvedRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${newIncId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      const resolvedInc = JSON.parse(checkResolvedRes.body).data;
      expect(resolvedInc.status).toBe('RESOLVED');
      expect(resolvedInc.resolvedAt).not.toBeNull();
    });
  });
});
