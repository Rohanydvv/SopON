import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { prisma } from '@sopon/database';
import { IncidentPriority, IncidentSeverity, IncidentStatus, ServiceEnvironment, ServiceStatus } from '@sopon/contracts';

describe('Phase 2: Services, Incidents & Webhook Alerts E2E Tests', () => {
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
  let integrationKey: string;

  describe('0. Setup Users and Organizations', () => {
    it('should register User A with Org A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `usera_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'User A',
          organizationName: `Org A ${timestamp}`,
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
          email: `userb_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'User B',
          organizationName: `Org B ${timestamp}`,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      userBToken = json.data.tokens.accessToken;
      userBOrgId = json.data.activeOrganizationId;
    });
  });

  describe('1. Services Catalog & Registry', () => {
    it('should allow User A to create services in Org A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: 'Payment Gateway',
          description: 'Core billing and payment transaction processor',
          tier: 'Tier 1',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data.name).toBe('Payment Gateway');
      expect(json.data.slug).toBe('payment-gateway');
      expect(json.data.status).toBe(ServiceStatus.OPERATIONAL);
      serviceAId = json.data.id;
    });

    it('should list services in Org A', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.length).toBe(1);
      expect(json.data[0].id).toBe(serviceAId);
    });

    it('should FORBID User B from accessing Org A service (Tenant Isolation)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/services/${serviceAId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should FORBID User A from accessing Org B service endpoint (Tenant Isolation)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userBOrgId}/services`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('2. Incidents Core Engine & Activity Timeline', () => {
    it('should declare an incident in Org A linked to Payment Gateway', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'Elevated 502 Errors in Payment Gateway',
          description: 'Spike in HTTP 502 bad gateway responses during checkout.',
          severity: IncidentSeverity.CRITICAL,
          priority: IncidentPriority.P1,
          serviceId: serviceAId,
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data.title).toBe('Elevated 502 Errors in Payment Gateway');
      expect(json.data.status).toBe(IncidentStatus.OPEN);
      expect(json.data.serviceName).toBe('Payment Gateway');
      incidentAId = json.data.id;
    });

    it('should transition incident status: OPEN -> INVESTIGATING -> RESOLVED', async () => {
      // 1. Move to INVESTIGATING
      const invRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { status: IncidentStatus.INVESTIGATING },
      });

      expect(invRes.statusCode).toBe(200);
      expect(JSON.parse(invRes.body).data.status).toBe(IncidentStatus.INVESTIGATING);

      // 2. Add manual note
      const noteRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/timeline`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          message: 'Identified downstream Redis connection timeout. Increasing pool size.',
          eventType: 'NOTE_ADDED',
        },
      });

      expect(noteRes.statusCode).toBe(201);
      expect(JSON.parse(noteRes.body).data.message).toContain('Redis connection timeout');

      // 3. Move to RESOLVED
      const resRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { status: IncidentStatus.RESOLVED },
      });

      expect(resRes.statusCode).toBe(200);
      const resJson = JSON.parse(resRes.body);
      expect(resJson.data.status).toBe(IncidentStatus.RESOLVED);
      expect(resJson.data.resolvedAt).toBeDefined();
    });

    it('should fetch complete incident details with chronological timeline', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.timeline.length).toBeGreaterThanOrEqual(3);
      expect(json.data.timeline.some((t: any) => t.eventType === 'INCIDENT_CREATED')).toBe(true);
      expect(json.data.timeline.some((t: any) => t.eventType === 'STATUS_CHANGED')).toBe(true);
      expect(json.data.timeline.some((t: any) => t.eventType === 'NOTE_ADDED')).toBe(true);
    });

    it('should filter incidents by status and severity', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents?status=RESOLVED&severity=CRITICAL`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.length).toBe(1);
      expect(json.data[0].id).toBe(incidentAId);
    });

    it('should FORBID User B from querying or modifying Org A incident', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });

  describe('3. Inbound Webhook Alert Ingestion', () => {
    it('should create Datadog integration in Org A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/integrations`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: 'Datadog Production Alerts',
          type: 'DATADOG',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data.key).toBeDefined();
      expect(json.data.webhookUrl).toContain('/api/v1/webhooks/alerts/');
      integrationKey = json.data.key;
    });

    it('should ingest alert via public webhook and auto-create incident', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${integrationKey}`,
        payload: {
          alertName: 'High CPU Usage on Auth Cluster',
          service: 'Payment Gateway',
          severity: 'CRITICAL',
          description: 'CPU utilization exceeded 95% threshold for 5m',
          details: { cluster: 'us-east-1', podCount: 12 },
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.action).toBe('CREATED');
      expect(json.data.incidentId).toBeDefined();
    });

    it('should deduplicate repeat alert into existing incident timeline', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${integrationKey}`,
        payload: {
          alertName: 'High CPU Usage on Auth Cluster',
          service: 'Payment Gateway',
          severity: 'CRITICAL',
          description: 'Repeat alert: CPU utilization still > 95%',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.action).toBe('DEDUPLICATED');
    });
  });
});