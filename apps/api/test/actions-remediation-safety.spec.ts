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
            targetReplicas: 8,
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
  });
});
