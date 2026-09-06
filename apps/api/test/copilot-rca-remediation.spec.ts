import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { prisma } from '@sopon/database';
import { IncidentSeverity, ServiceEnvironment } from '@sopon/contracts';

describe('Phase 4: Autonomous Incident Investigation, RCA & Remediation Planning E2E Tests', () => {
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
  let userBOrgId: string;

  let serviceAId: string;
  let incidentAId: string;
  let novelIncidentId: string;

  describe('0. Setup Users, Services and Knowledge Runbooks', () => {
    it('should register User A with Org A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `usera_copilot_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Incident Commander A',
          organizationName: `Org Copilot A ${timestamp}`,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      userAToken = json.data.tokens.accessToken;
      userAOrgId = json.data.activeOrganizationId;
    });

    it('should register User B with Org B', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `userb_copilot_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Incident Commander B',
          organizationName: `Org Copilot B ${timestamp}`,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      userBToken = json.data.tokens.accessToken;
      userBOrgId = json.data.activeOrganizationId;
    });

    it('should create Payment Gateway service in Org A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: 'Payment Gateway',
          description: 'Core billing API',
          tier: 'Tier 1',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });

      expect(res.statusCode).toBe(201);
      serviceAId = JSON.parse(res.body).data.id;
    });

    it('should ingest Payment Gateway Redis runbook in Org A', async () => {
      const markdownContent = `
# Payment Gateway Redis Connection Pool Runbook

## Overview
Remediation procedures when Payment Gateway encounters high latency or 502 errors due to Redis pool exhaustion.

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
          serviceId: serviceAId,
        },
      });

      expect(res.statusCode).toBe(201);
    });
  });

  describe('1. Known Failure Pattern: Autonomous Investigation & High-Confidence RCA', () => {
    it('should declare a critical Redis pool exhaustion incident in Org A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'High HTTP 502 Bad Gateway Errors in Payment Gateway',
          description: 'Sudden spike in HTTP 502 bad gateway errors and upstream timeouts due to Redis client connection pool exhaustion.',
          severity: IncidentSeverity.CRITICAL,
          serviceId: serviceAId,
        },
      });

      expect(res.statusCode).toBe(201);
      incidentAId = JSON.parse(res.body).data.id;
    });

    it('should trigger autonomous 7-stage incident reasoning pipeline (POST /analyze)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/analyze`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      const data = json.data;

      // 1. UNDERSTAND
      expect(data.understand.severity).toBe('CRITICAL');
      expect(data.understand.detectedSymptoms.length).toBeGreaterThanOrEqual(2);
      expect(data.understand.detectedSymptoms.some((s: any) => s.signal.includes('502'))).toBe(true);
      expect(data.understand.detectedSymptoms.some((s: any) => s.signal.includes('Pool Exhaustion'))).toBe(true);

      // 2. INVESTIGATE
      expect(data.investigate.serviceMetadata.name).toBe('Payment Gateway');
      expect(data.investigate.serviceMetadata.environment).toBe('PRODUCTION');

      // 3. RETRIEVE
      expect(data.retrieve.matchedDocumentsCount).toBeGreaterThanOrEqual(1);
      expect(data.retrieve.documents[0].title).toContain('Redis Connection Pool Runbook');

      // 4. REASON / RCA
      expect(data.reasonRca.confidenceScore).toBeGreaterThanOrEqual(0.85);
      expect(data.reasonRca.confidenceLevel).toBe('HIGH');
      expect(data.reasonRca.isDefinitive).toBe(true);
      expect(data.reasonRca.primaryRootCause).toContain('Redis Client Connection Pool Exhaustion');
      expect(data.reasonRca.evidenceChain.length).toBeGreaterThanOrEqual(2);

      // 5. DECIDE & PLAN
      expect(data.decidePlan.riskTier).toBe('SAFE_AUTOMATIC');
      expect(data.decidePlan.recommendedMode).toBe('AUTONOMOUS');
      expect(data.decidePlan.actions.length).toBeGreaterThanOrEqual(2);
      expect(data.decidePlan.actions[0].actionType).toBe('CONFIG_UPDATE');
      expect(data.decidePlan.actions[1].actionType).toBe('RESTART_POD');

      // 6. VERIFY
      expect(data.verify.preExecutionSafetyChecks.length).toBeGreaterThanOrEqual(2);
      expect(data.verify.postExecutionVerificationProbes.length).toBeGreaterThanOrEqual(2);

      // 7. RESOLVE / ESCALATE
      expect(data.resolveEscalate.isReady).toBe(true);
    });

    it('should retrieve latest cached analysis (GET /analysis)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/analysis`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.understand.incidentId).toBe(incidentAId);
      expect(json.data.reasonRca.primaryRootCause).toContain('Redis');
    });

    it('should verify timeline note was automatically appended', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.timeline.length).toBeGreaterThanOrEqual(1);
      expect(json.data.timeline.some((t: any) => t.message.includes('Autonomous AI Investigation completed'))).toBe(true);
    });
  });

  describe('2. Novel / Undefined Incident Handling: Escalation Package & Non-Definitive RCA', () => {
    it('should declare a novel, un-runbooked incident in Org A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'Unexplained BGP Route Flapping in External CDN Edge',
          description: 'Packet drop observed on external transit peering provider without local telemetry alarms.',
          severity: IncidentSeverity.MEDIUM,
        },
      });

      expect(res.statusCode).toBe(201);
      novelIncidentId = JSON.parse(res.body).data.id;
    });

    it('should flag low confidence and generate full structured escalation package', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${novelIncidentId}/analyze`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      const data = json.data;

      // RCA should reflect low/medium confidence
      expect(data.reasonRca.confidenceScore).toBeLessThan(0.75);
      expect(data.reasonRca.isDefinitive).toBe(false);

      // Autonomous readiness must be false and produce escalation package
      expect(data.resolveEscalate.isReady).toBe(false);
      expect(data.resolveEscalate.blockers.length).toBeGreaterThan(0);
      expect(data.resolveEscalate.escalationPackage).toBeDefined();
      expect(data.resolveEscalate.escalationPackage.candidateCauses.length).toBeGreaterThan(0);
      expect(data.resolveEscalate.escalationPackage.recommendedNextSteps.length).toBeGreaterThan(0);
    });
  });

  describe('3. Multi-Tenant Boundary Isolation for Autonomous Operations', () => {
    it('should FORBID User B from triggering RCA analysis on Org A incident (404/403)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/analyze`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should NOT find Org A incident when User B queries within Org B', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userBOrgId}/incidents/${incidentAId}/analysis`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});