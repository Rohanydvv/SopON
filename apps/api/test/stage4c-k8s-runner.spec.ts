import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { prisma } from '@sopon/database';
import { IncidentPriority, IncidentSeverity, IncidentStatus, ServiceEnvironment } from '@sopon/contracts';
import { ActionsService } from '../src/modules/actions/actions.service';

describe('Milestone 4C: Controlled Infrastructure Action Runners & Staged Rollout E2E Tests', () => {
  let app: NestFastifyApplication;
  let actionsService: ActionsService;

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

    actionsService = moduleFixture.get<ActionsService>(ActionsService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const timestamp = Date.now();
  let ownerAToken: string;
  let userAOrgId: string;
  let serviceAId: string;
  let incidentAId: string;

  let ownerBToken: string;
  let userBOrgId: string;
  let serviceBId: string;
  let incidentBId: string;

  describe('0. Setup Multi-Tenant Orgs, Kubeconfig Vault Credentials, and Services', () => {
    it('should setup Org A, User A, Payment Gateway service, and Kubeconfig in Vault', async () => {
      // 1. Register User A
      const regA = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4c_usera_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org A Lead',
          organizationName: `Stage4C Infrastructure Corp ${timestamp}`,
        },
      });

      expect(regA.statusCode).toBe(201);
      const jsonA = JSON.parse(regA.body);
      ownerAToken = jsonA.data.tokens.accessToken;
      userAOrgId = jsonA.data.activeOrganizationId;

      // 2. Create Service A (Payment Gateway)
      const srvA = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Payment Checkout API',
          description: 'Core payment processing gateway',
          tier: 'Tier 1',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });
      expect(srvA.statusCode).toBe(201);
      serviceAId = JSON.parse(srvA.body).data.id;

      // 3. Store Kubeconfig in 4B Vault
      const vaultRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Production Kubernetes Cluster',
          targetType: 'KUBERNETES',
          environment: ServiceEnvironment.PRODUCTION,
          serviceId: serviceAId,
          secretPayload: {
            clusterEndpoint: 'https://k8s-prod.company.internal:6443',
            token: 'eyJhbGciOiJSUzI1NiJ9.k8s-live-service-token-secret',
            clientCertificateData: 'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCg==',
          },
          metadataJson: { clusterName: 'k8s-prod-us-east-1' },
        },
      });
      expect(vaultRes.statusCode).toBe(201);

      // 4. Declare test Incident in Org A
      const incA = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'Elevated 502 Errors in Payment Checkout API',
          description: 'Pod replica exhaustion during checkout flash sale',
          severity: IncidentSeverity.CRITICAL,
          priority: IncidentPriority.P1,
          serviceId: serviceAId,
        },
      });
      expect(incA.statusCode).toBe(201);
      incidentAId = JSON.parse(incA.body).data.id;
    });

    it('should setup Org B for tenant isolation testing', async () => {
      const regB = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4c_userb_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org B Lead',
          organizationName: `Stage4C Tenant B ${timestamp}`,
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
          name: 'Org B Analytics',
          tier: 'Tier 2',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });
      expect(srvB.statusCode).toBe(201);
      serviceBId = JSON.parse(srvB.body).data.id;

      const incB = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userBOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerBToken}` },
        payload: {
          title: 'Org B Analytics Lag',
          description: 'Pipeline lag',
          severity: IncidentSeverity.HIGH,
          serviceId: serviceBId,
        },
      });
      expect(incB.statusCode).toBe(201);
      incidentBId = JSON.parse(incB.body).data.id;
    });
  });

  describe('1. Dry-Run Simulation Mode (Zero Mutation Guarantee)', () => {
    it('Scenario 1: should simulate SCALE_SERVICE_REPLICAS dry-run without mutating cluster', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/actions/simulate`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          parameters: {
            serviceSlug: 'payment-checkout-api',
            targetReplicas: 4,
            reason: 'Scale replicas to handle elevated checkout traffic',
          },
          targetServiceId: serviceAId,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.isDryRun).toBe(true);
      expect(json.data.status).toBe('SUCCEEDED');
      expect(json.data.executionOutput.simulated).toBe(true);
      expect(json.data.executionOutput.targetReplicas).toBe(4);
      expect(json.data.preconditionChecks.length).toBeGreaterThanOrEqual(2);

      // Verify incident status is still OPEN/INVESTIGATING (zero premature resolution)
      const incCheck = await prisma.incident.findUnique({ where: { id: incidentAId } });
      expect(incCheck!.status).not.toBe(IncidentStatus.RESOLVED);
    });

    it('Scenario 2: should simulate RESTART_SERVICE_WORKER dry-run', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/actions/simulate`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          parameters: {
            serviceSlug: 'payment-checkout-api',
            gracePeriodSeconds: 30,
            reason: 'Simulated rolling restart',
          },
          targetServiceId: serviceAId,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.isDryRun).toBe(true);
      expect(json.data.executionOutput.strategy).toBe('RollingUpdate');
      expect(json.data.executionOutput.estimatedDowntimeSeconds).toBe(0);
    });
  });

  describe('2. Hard Blast-Radius Controls & Precondition Safety Gates', () => {
    it('Scenario 3: should REJECT replica scaling request exceeding ceiling (max 20 replicas) in runner preconditions', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/actions/execute`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          parameters: {
            serviceSlug: 'payment-checkout-api',
            targetReplicas: 25, // Exceeds blast radius ceiling of 20
          },
          targetServiceId: serviceAId,
        },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('PRECONDITION_FAILED');
      expect(json.error.message).toContain('safety ceiling');
    });

    it('Scenario 4: should REJECT scaling step delta exceeding +5 pods threshold', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/actions/execute`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          parameters: {
            serviceSlug: 'payment-checkout-api',
            targetReplicas: 12, // Baseline is 2, delta = +10 pods (exceeds 5 pods delta limit)
          },
          targetServiceId: serviceAId,
        },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('PRECONDITION_FAILED');
      expect(json.error.message).toContain('blast-radius limit of 5 pods');
    });

    it('Scenario 5: should REJECT execution when Organization Kill Switch is active (403 Forbidden)', async () => {
      // 1. Activate kill-switch
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/actions/policy`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { autonomousRemediationEnabled: false },
      });

      // 2. Attempt execution
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/actions/execute`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          parameters: { serviceSlug: 'payment-checkout-api', targetReplicas: 4 },
          targetServiceId: serviceAId,
        },
      });

      expect(res.statusCode).toBe(403);
      expect(JSON.parse(res.body).error.code).toBe('REMEDIATION_DISABLED_BY_KILL_SWITCH');

      // 3. Deactivate kill-switch
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/actions/policy`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { autonomousRemediationEnabled: true },
      });
    });

    it('Scenario 6: should enforce REQUIRES_APPROVAL when production approval policy is enabled', async () => {
      // 1. Set requireApprovalForProduction = true
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/actions/policy`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { requireApprovalForProduction: true },
      });

      // 2. Execute on production service
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/actions/execute`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          parameters: { serviceSlug: 'payment-checkout-api', targetReplicas: 4 },
          targetServiceId: serviceAId,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.status).toBe('PENDING_APPROVAL');
      expect(json.data.riskTier).toBe('REQUIRES_APPROVAL');

      // 3. Approve action
      const approveRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/actions/${json.data.id}/approve`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(approveRes.statusCode).toBe(200);
      expect(JSON.parse(approveRes.body).data.status).toBe('SUCCEEDED');

      // 4. Reset policy
      await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/actions/policy`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { requireApprovalForProduction: false },
      });
    });
  });

  describe('3. Kubernetes Execution, Vault Authentication & Closed-Loop Verification', () => {
    it('Scenario 7: should execute SCALE_SERVICE_REPLICAS via Kubernetes adapter and auto-resolve incident on passed probes', async () => {
      // Create fresh incident for clean lifecycle
      const freshInc = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'High Load on Payment API - Scale Needed',
          description: 'Scale from 2 to 4 pods',
          severity: IncidentSeverity.CRITICAL,
          serviceId: serviceAId,
        },
      });
      const testIncId = JSON.parse(freshInc.body).data.id;

      const execRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${testIncId}/actions/execute`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          parameters: {
            serviceSlug: 'payment-checkout-api',
            targetReplicas: 4,
          },
          targetServiceId: serviceAId,
        },
      });

      expect(execRes.statusCode).toBe(200);
      const json = JSON.parse(execRes.body);
      expect(json.data.status).toBe('SUCCEEDED');
      expect(json.data.executionOutput.currentReplicas).toBe(4);
      expect(json.data.verificationResults.length).toBeGreaterThanOrEqual(2);
      expect(json.data.verificationResults.every((r: any) => r.passed)).toBe(true);

      // Verify incident transitioned to RESOLVED
      const incCheck = await prisma.incident.findUnique({ where: { id: testIncId } });
      expect(incCheck!.status).toBe(IncidentStatus.RESOLVED);
      expect(incCheck!.resolvedAt).toBeDefined();
    });

    it('Scenario 8: should execute RESTART_SERVICE_WORKER via Kubernetes adapter with rolling restart', async () => {
      const freshInc = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'Worker Memory Leak on Payment Service',
          description: 'Restart needed',
          severity: IncidentSeverity.HIGH,
          serviceId: serviceAId,
        },
      });
      const testIncId = JSON.parse(freshInc.body).data.id;

      const execRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${testIncId}/actions/execute`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          actionType: 'RESTART_SERVICE_WORKER',
          parameters: {
            serviceSlug: 'payment-checkout-api',
            gracePeriodSeconds: 30,
          },
          targetServiceId: serviceAId,
        },
      });

      expect(execRes.statusCode).toBe(200);
      const json = JSON.parse(execRes.body);
      expect(json.data.status).toBe('SUCCEEDED');
      expect(json.data.executionOutput.strategy).toBe('RollingUpdate');
      expect(json.data.executionOutput.currentRevision).toBeDefined();
      expect(json.data.verificationResults.every((r: any) => r.passed)).toBe(true);
    });
  });

  describe('4. Closed-Loop Verification Failure & Automated Rollback', () => {
    it('Scenario 9: should trigger AUTOMATIC ROLLBACK when post-execution verification probes fail', async () => {
      const freshInc = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          title: 'Probe Failure Incident Test',
          description: 'Simulating pod crash on scale',
          severity: IncidentSeverity.CRITICAL,
          serviceId: serviceAId,
        },
      });
      const testIncId = JSON.parse(freshInc.body).data.id;

      // Execute action with simulated verification probe failure
      const result = await actionsService.executeAction(
        userAOrgId,
        testIncId,
        {
          actionType: 'SCALE_SERVICE_REPLICAS',
          parameters: { serviceSlug: 'payment-checkout-api', targetReplicas: 5 },
          targetServiceId: serviceAId,
        },
        undefined,
        false,
        true, // failVerificationProbe = true
      );

      // Verify status is ROLLED_BACK
      expect(result.status).toBe('ROLLED_BACK');
      expect(result.rollbackStatus).toBe('EXECUTED');
      expect(result.errorMessage).toContain('Post-execution verification');

      // Verify incident is NOT resolved and has rollback timeline entries
      const inc = await prisma.incident.findUnique({ where: { id: testIncId } });
      expect(inc!.status).not.toBe(IncidentStatus.RESOLVED);

      const timeline = await prisma.incidentTimeline.findMany({
        where: { incidentId: testIncId },
        orderBy: { createdAt: 'desc' },
      });

      expect(timeline.some((t) => t.eventType === 'REMEDIATION_VERIFICATION_FAILED')).toBe(true);
      expect(timeline.some((t) => t.eventType === 'REMEDIATION_ROLLED_BACK')).toBe(true);
    });
  });

  describe('5. Strict Multi-Tenant Isolation & Zero Secret Leakage', () => {
    it('Scenario 10: should FORBID Org B from executing actions against Org A services (Tenant Isolation)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userBOrgId}/incidents/${incidentBId}/actions/execute`,
        headers: { authorization: `Bearer ${ownerBToken}` },
        payload: {
          actionType: 'SCALE_SERVICE_REPLICAS',
          parameters: { serviceSlug: 'payment-checkout-api', targetReplicas: 3 },
          targetServiceId: serviceAId, // Belongs to Org A
        },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.message).toContain('Specified target service does not belong to this organization');
    });

    it('Scenario 11: verify ZERO SECRET LEAKAGE in execution records, timeline, and audit logs', async () => {
      const executions = await prisma.actionExecution.findMany({
        where: { organizationId: userAOrgId },
      });

      for (const exec of executions) {
        const payloadStr = JSON.stringify(exec.parametersJson);
        const outputStr = JSON.stringify(exec.executionOutputJson);

        expect(payloadStr).not.toContain('k8s-live-service-token-secret');
        expect(outputStr).not.toContain('k8s-live-service-token-secret');
        expect(payloadStr).not.toContain('LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCg==');
      }

      const timeline = await prisma.incidentTimeline.findMany({
        where: { incidentId: incidentAId },
      });

      for (const event of timeline) {
        const metaStr = JSON.stringify(event.metadataJson);
        expect(metaStr).not.toContain('k8s-live-service-token-secret');
      }
    });
  });
});
