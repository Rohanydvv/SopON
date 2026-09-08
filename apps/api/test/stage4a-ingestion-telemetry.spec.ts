import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { prisma } from '@sopon/database';
import * as crypto from 'crypto';
import { ServiceEnvironment } from '@sopon/contracts';

describe('Milestone 4A: Ingestion Webhooks, Ingestion Security & Live Telemetry E2E Tests', () => {
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
  let serviceAId: string;

  let userBToken: string;
  let userBOrgId: string;
  let serviceBId: string;

  let datadogKey: string;
  let datadogSecret: string;

  let prometheusKey: string;
  let prometheusSecret: string;

  let sentryKey: string;
  let sentrySecret: string;

  describe('0. Setup Multi-Tenant Organizations, Services, and Integrations', () => {
    it('should setup Org A, User A, and Payment Gateway service', async () => {
      const regA = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4a_usera_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org A Lead',
          organizationName: `Stage4A Corp ${timestamp}`,
        },
      });

      expect(regA.statusCode).toBe(201);
      const jsonA = JSON.parse(regA.body);
      userAToken = jsonA.data.tokens.accessToken;
      userAOrgId = jsonA.data.activeOrganizationId;

      const srvA = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          name: 'Payment Checkout API',
          description: 'Core payment processing gateway',
          tier: 'Tier 1',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });

      expect(srvA.statusCode).toBe(201);
      serviceAId = JSON.parse(srvA.body).data.id;
    });

    it('should setup Org B for tenant isolation verification', async () => {
      const regB = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4a_userb_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org B Lead',
          organizationName: `Stage4A Tenant B ${timestamp}`,
        },
      });

      expect(regB.statusCode).toBe(201);
      const jsonB = JSON.parse(regB.body);
      userBToken = jsonB.data.tokens.accessToken;
      userBOrgId = jsonB.data.activeOrganizationId;

      const srvB = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userBOrgId}/services`,
        headers: { authorization: `Bearer ${userBToken}` },
        payload: {
          name: 'Org B Analytics',
          tier: 'Tier 2',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });
      serviceBId = JSON.parse(srvB.body).data.id;
      expect(serviceBId).toBeDefined();
    });

    it('should register Datadog, Prometheus, and Sentry integrations for Org A', async () => {
      // 1. Datadog
      const ddRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/integrations`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { name: 'Datadog Production Alerts', type: 'DATADOG' },
      });
      expect(ddRes.statusCode).toBe(201);
      datadogKey = JSON.parse(ddRes.body).data.key;
      const ddDb = await prisma.integration.findUnique({ where: { key: datadogKey } });
      datadogSecret = ddDb!.secret;

      // 2. Prometheus
      const promRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/integrations`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { name: 'Prometheus Alertmanager', type: 'PROMETHEUS' },
      });
      expect(promRes.statusCode).toBe(201);
      prometheusKey = JSON.parse(promRes.body).data.key;
      const promDb = await prisma.integration.findUnique({ where: { key: prometheusKey } });
      prometheusSecret = promDb!.secret;

      // 3. Sentry
      const sentryRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/integrations`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: { name: 'Sentry Error Tracker', type: 'SENTRY' },
      });
      expect(sentryRes.statusCode).toBe(201);
      sentryKey = JSON.parse(sentryRes.body).data.key;
      const sentryDb = await prisma.integration.findUnique({ where: { key: sentryKey } });
      sentrySecret = sentryDb!.secret;
    });
  });

  describe('1. Webhook Ingestion: Datadog, Prometheus, Sentry & Generic', () => {
    it('Scenario 1: should ingest valid Datadog monitor webhook and auto-open incident', async () => {
      const payload = {
        id: 'dd-alert-101',
        event_title: 'High HTTP 502 Rate on Payment API',
        body: 'Datadog monitor triggered: 5xx rate exceeded 15% threshold in us-east-1.',
        alert_type: 'error',
        priority: 'urgent',
        service: 'Payment Checkout API',
        date: Math.floor(Date.now() / 1000),
        snapshot: 'https://p.datadoghq.com/snapshots/101',
        link: 'https://app.datadoghq.com/monitors/101',
      };

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/datadog/${datadogKey}`,
        payload,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.action).toBe('CREATED');
      expect(json.data.incidentTitle).toBe('High HTTP 502 Rate on Payment API');
      expect(json.data.severity).toBe('CRITICAL');
      expect(json.data.serviceId).toBe(serviceAId);
    });

    it('Scenario 2: should ingest valid Prometheus Alertmanager webhook with firing alerts and HMAC signature', async () => {
      const payload = {
        version: '4',
        groupKey: 'prom-group-payment',
        status: 'firing',
        receiver: 'sopon-webhook',
        commonLabels: {
          alertname: 'RedisConnectionPoolExhausted',
          service: 'Payment Checkout API',
          severity: 'CRITICAL',
        },
        commonAnnotations: {
          summary: 'Redis pool exhausted',
          description: 'Payment Gateway active Redis pool reached 100% capacity.',
        },
        alerts: [
          {
            status: 'firing',
            labels: { alertname: 'RedisConnectionPoolExhausted', service: 'Payment Checkout API', severity: 'CRITICAL' },
            annotations: { description: 'Payment Gateway active Redis pool reached 100% capacity.' },
            startsAt: new Date().toISOString(),
            fingerprint: 'fp-prom-redis-001',
          },
        ],
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', prometheusSecret).update(rawBody).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/prometheus/${prometheusKey}`,
        headers: {
          'x-sopon-signature': `sha256=${signature}`,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.action).toBe('CREATED');
      expect(json.data.incidentTitle).toBe('RedisConnectionPoolExhausted');
      expect(json.data.serviceId).toBe(serviceAId);
    });

    it('Scenario 3: should ingest valid Sentry issue webhook and auto-open incident with signature', async () => {
      const payload = {
        id: 'sentry-evt-991',
        action: 'created',
        data: {
          issue: {
            id: 'ISSUE-7721',
            title: 'Redis::TimeoutError: Connection pool timed out after 5000ms',
            culprit: 'app/controllers/checkout_controller.rb in process_payment',
            level: 'fatal',
            project: { name: 'Payment Checkout API' },
            web_url: 'https://sentry.io/organizations/stage4a/issues/7721/',
          },
        },
      };

      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', sentrySecret).update(rawBody).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/sentry/${sentryKey}`,
        headers: {
          'x-sentry-signature': signature,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.action).toBe('CREATED');
      expect(json.data.incidentTitle).toContain('Redis::TimeoutError');
      expect(json.data.severity).toBe('CRITICAL');
      expect(json.data.serviceId).toBe(serviceAId);
    });
  });

  describe('2. Ingestion Security: HMAC-SHA256, Replay, Drift, Deduplication & Rate Limits', () => {
    it('Scenario 4: should ACCEPT request with valid HMAC-SHA256 signature', async () => {
      const payload = {
        alertName: 'Authenticated Payment Alert',
        service: 'Payment Checkout API',
        severity: 'HIGH',
        description: 'Webhook signed with HMAC-SHA256',
      };
      const rawBody = JSON.stringify(payload);
      const signature = crypto.createHmac('sha256', datadogSecret).update(rawBody).digest('hex');

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${datadogKey}`,
        headers: {
          'x-sopon-signature': `sha256=${signature}`,
          'content-type': 'application/json',
        },
        payload,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.action).toBe('CREATED');
    });

    it('Scenario 5: should REJECT request with INVALID HMAC-SHA256 signature (401 Unauthorized)', async () => {
      const payload = {
        alertName: 'Forged Alert Payload',
        severity: 'CRITICAL',
      };
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${datadogKey}`,
        headers: {
          'x-sopon-signature': 'sha256=badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadb',
          'content-type': 'application/json',
        },
        payload,
      });

      expect(res.statusCode).toBe(401);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('INVALID_SIGNATURE');
    });

    it('Scenario 6: should REJECT request with expired timestamp > 300s drift (400 Bad Request)', async () => {
      const staleTimestamp = Date.now() - 360000; // 6 minutes ago
      const payload = {
        alertName: 'Stale Replay Alert',
        timestamp: staleTimestamp,
      };

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${datadogKey}`,
        payload,
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('TIMESTAMP_EXPIRED_OR_DRIFT');
    });

    it('Scenario 7: should REJECT replayed event ID within TTL (409 Conflict)', async () => {
      const eventId = `nonce-${Date.now()}`;
      const payload = {
        alertName: 'Replay Protection Test',
        eventId,
      };

      // First attempt: succeeds
      const firstRes = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${datadogKey}`,
        payload,
      });
      expect(firstRes.statusCode).toBe(200);

      // Replay attempt: rejected
      const replayRes = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${datadogKey}`,
        payload,
      });
      expect(replayRes.statusCode).toBe(409);
      const json = JSON.parse(replayRes.body);
      expect(json.error.code).toBe('REPLAY_DETECTED');
    });

    it('Scenario 8: should DEDUPLICATE repeat alert into existing open incident timeline', async () => {
      const alertPayload = {
        alertName: 'Database High CPU Load Alert',
        service: 'Payment Checkout API',
        severity: 'HIGH',
        description: 'CPU load is 94%',
      };

      // 1. Initial fire: creates incident
      const res1 = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${datadogKey}`,
        payload: alertPayload,
      });
      expect(res1.statusCode).toBe(200);
      const incId = JSON.parse(res1.body).data.incidentId;
      expect(JSON.parse(res1.body).data.action).toBe('CREATED');

      // 2. Repeat fire: deduplicates into existing incident
      const res2 = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${datadogKey}`,
        payload: {
          ...alertPayload,
          description: 'CPU load is still elevated at 96%',
        },
      });
      expect(res2.statusCode).toBe(200);
      const json2 = JSON.parse(res2.body);
      expect(json2.data.action).toBe('DEDUPLICATED');
      expect(json2.data.incidentId).toBe(incId);

      // Verify timeline entry was added
      const timelineRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incId}`,
        headers: { authorization: `Bearer ${userAToken}` },
      });
      expect(timelineRes.statusCode).toBe(200);
      const timeline = JSON.parse(timelineRes.body).data.timeline;
      expect(timeline.some((t: any) => t.eventType === 'ALERT_DEDUPLICATED')).toBe(true);
    });

    it('Scenario 9: should REJECT invalid malformed payload (400 Validation Error)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/prometheus/${prometheusKey}`,
        payload: {
          // Missing required 'status' and 'alerts' array
          version: '4',
        },
      });

      expect(res.statusCode).toBe(400);
    });

    it('Scenario 10: should enforce STRICT TENANT ISOLATION (Org B integration cannot touch Org A)', async () => {
      // Create integration in Org B
      const orgBIntRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userBOrgId}/integrations`,
        headers: { authorization: `Bearer ${userBToken}` },
        payload: { name: 'Org B Datadog', type: 'DATADOG' },
      });
      const orgBKey = JSON.parse(orgBIntRes.body).data.key;

      // Attempt to link alert to Org A's service name from Org B's webhook
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/webhooks/alerts/${orgBKey}`,
        payload: {
          alertName: 'Org B Cross Tenant Attempt',
          service: 'Payment Checkout API', // belongs to Org A
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      const createdInc = await prisma.incident.findUnique({ where: { id: json.data.incidentId } });
      // Service must NOT be linked across tenant boundary
      expect(createdInc!.organizationId).toBe(userBOrgId);
      expect(createdInc!.serviceId).toBeNull();
    });

    it('Scenario 11: should create IMMUTABLE AUDIT LOGS for webhook events', async () => {
      const auditLogs = await prisma.auditLog.findMany({
        where: { organizationId: userAOrgId, entityType: { in: ['Incident', 'Integration'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(1);
      expect(auditLogs.some((a) => a.action === 'WEBHOOK_ALERT_INGESTED' || a.action === 'WEBHOOK_REJECTED')).toBe(true);
    });
  });

  describe('3. Telemetry & Observability Query Service', () => {
    it('Scenario 12: should query live service telemetry and return structured metric series and health summary', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/telemetry/services/${serviceAId}?timeWindowMinutes=15`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.serviceId).toBe(serviceAId);
      expect(json.data.serviceName).toBe('Payment Checkout API');
      expect(json.data.summary).toBeDefined();
      expect(json.data.summary.healthStatus).toBeDefined();
      expect(json.data.summary.currentErrorRatePct).toBeDefined();
      expect(json.data.summary.p95LatencyMs).toBeDefined();
      expect(json.data.metrics['ERROR_RATE_5XX']).toBeDefined();
      expect(json.data.metrics['ERROR_RATE_5XX'].samplePoints.length).toBeGreaterThanOrEqual(2);
      expect(json.data.metrics['P95_LATENCY_MS']).toBeDefined();
    });

    it('Scenario 13: should query telemetry via POST query filter endpoint', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/telemetry/query`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          serviceId: serviceAId,
          timeWindowMinutes: 30,
          metricTypes: ['ERROR_RATE_5XX', 'ACTIVE_CONNECTIONS'],
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.metrics['ERROR_RATE_5XX']).toBeDefined();
      expect(json.data.metrics['ACTIVE_CONNECTIONS']).toBeDefined();
      expect(json.data.metrics['CPU_USAGE_PCT']).toBeUndefined(); // Only requested metrics
    });

    it('Scenario 14: should FORBID User B from querying Org A service telemetry (Tenant Isolation)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/telemetry/services/${serviceAId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(403);
    });
  });
});
