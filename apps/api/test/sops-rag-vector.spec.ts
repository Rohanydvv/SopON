import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { prisma } from '@sopon/database';
import { IncidentSeverity, ServiceEnvironment } from '@sopon/contracts';

describe('Phase 3: SOP Knowledge Base, RAG & Vector Search E2E Tests', () => {
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
  let documentAId: string;
  let incidentAId: string;

  describe('0. Setup Users and Services', () => {
    it('should register User A with Org A', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `usera_sop_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'SOP Engineer A',
          organizationName: `Org SOP A ${timestamp}`,
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
          email: `userb_sop_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'SOP Engineer B',
          organizationName: `Org SOP B ${timestamp}`,
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
  });

  describe('1. SOP Document Creation & Automatic Chunking', () => {
    it('should upload and vector-index a runbook document', async () => {
      const markdownContent = `
# Payment Gateway Redis Connection Pool Runbook

## Overview
This runbook guides on-call engineers when the Payment Gateway encounters high latency or 502 errors due to Redis pool exhaustion.

## Immediate Remediation Steps
1. Inspect active Redis client connection count with redis-cli info clients
2. Increase REDIS_MAX_CONNECTIONS pool parameter in Helm values config
3. Restart payment-gateway worker pods gracefully using kubectl rollout restart
4. Verify HTTP 502 error rates drop below 0.05% in Datadog dashboard
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
      const json = JSON.parse(res.body);
      expect(json.data.title).toBe('Payment Gateway Redis Connection Pool Runbook');
      expect(json.data.chunkCount).toBeGreaterThanOrEqual(1);
      documentAId = json.data.id;
    });

    it('should list documents with chunk statistics in Org A', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/documents`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.length).toBe(1);
      expect(json.data[0].id).toBe(documentAId);
      expect(json.data[0].chunkCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe('2. Semantic RAG Vector Search & Incident Auto-Matching', () => {
    it('should perform semantic RAG search across knowledge chunks', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/rag/search`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          query: 'Redis connection pool timeout and restart pods',
          topK: 3,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.length).toBeGreaterThanOrEqual(1);
      expect(json.data[0].documentTitle).toContain('Payment Gateway Redis');
      expect(json.data[0].similarityScore).toBeGreaterThan(0.2);
    });

    it('should auto-recommend SOP runbooks for an active incident', async () => {
      // 1. Declare incident
      const incRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'High HTTP 502 Errors in Payment Gateway',
          description: 'Spike in timeout errors and connection drops during card authorization.',
          severity: IncidentSeverity.CRITICAL,
          serviceId: serviceAId,
        },
      });

      expect(incRes.statusCode).toBe(201);
      incidentAId = JSON.parse(incRes.body).data.id;

      // 2. Query recommended SOPs
      const recRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${incidentAId}/recommended-sops`,
        headers: { authorization: `Bearer ${userAToken}` },
      });

      expect(recRes.statusCode).toBe(200);
      const recJson = JSON.parse(recRes.body);
      expect(recJson.data.length).toBeGreaterThanOrEqual(1);
      expect(recJson.data[0].title).toContain('Redis Connection Pool');
      expect(recJson.data[0].remediationSteps.length).toBeGreaterThan(0);
    });
  });

  describe('3. Multi-Tenant Boundary Isolation', () => {
    it('should FORBID User B from searching or accessing Org A knowledge documents', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/documents/${documentAId}`,
        headers: { authorization: `Bearer ${userBToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('should NOT return Org A chunks when User B searches in Org B', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userBOrgId}/rag/search`,
        headers: { authorization: `Bearer ${userBToken}` },
        payload: {
          query: 'Payment Gateway Redis',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.length).toBe(0);
    });
  });

  describe('4. External URL Webpage Ingestion & AI Grounded Question Answering', () => {
    it('should fetch external webpage, extract actual content, chunk it, and index for RAG', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/documents`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          title: 'Redis Connection Pooling Documentation',
          sourceType: 'URL',
          sourceUrl: 'https://redis.io/docs/latest/develop/clients/pools-and-muxing/',
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data.title).toContain('Redis');
      expect(json.data.chunkCount).toBeGreaterThanOrEqual(2);
      expect(json.data.content).toContain('Connection pools and multiplexing');
      expect(json.data.content).not.toBe('https://redis.io/docs/latest/develop/clients/pools-and-muxing/');
    });

    it('should answer "How does connection multiplexing work?" using Redis documentation as primary source', async () => {
      const answerRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/rag/answer`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          question: 'How does connection multiplexing work?',
        },
      });

      expect(answerRes.statusCode).toBe(200);
      const answerJson = JSON.parse(answerRes.body);
      expect(answerJson.data.hasContext).toBe(true);
      expect(answerJson.data.sources.length).toBe(1);
      expect(answerJson.data.sources[0].documentTitle).toBe('Redis Connection Pooling Documentation');
      expect(answerJson.data.sources[0].sourceUrl).toBe('https://redis.io/docs/latest/develop/clients/pools-and-muxing/');
      expect(answerJson.data.sources.every((s: { documentTitle: string }) => !s.documentTitle.includes('Payment Gateway Outage'))).toBe(true);
      expect(answerJson.data.answer.toLowerCase()).toContain('multiplex');
      expect(answerJson.data.supportingChunks.length).toBeGreaterThanOrEqual(1);
    });

    it('should answer "How does Redis connection pooling work?" grounded in Redis documentation', async () => {
      const answerRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/rag/answer`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          question: 'How does Redis connection pooling work?',
        },
      });

      expect(answerRes.statusCode).toBe(200);
      const answerJson = JSON.parse(answerRes.body);
      expect(answerJson.data.hasContext).toBe(true);
      expect(answerJson.data.sources[0].documentTitle).toBe('Redis Connection Pooling Documentation');
      expect(answerJson.data.sources.every((s: { documentTitle: string }) => !s.documentTitle.includes('Payment Gateway Outage'))).toBe(true);
      expect(answerJson.data.answer.toLowerCase()).toContain('pool');
    });

    it('should refuse to answer out-of-context questions without hallucinating', async () => {
      const answerRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/rag/answer`,
        headers: { authorization: `Bearer ${userAToken}` },
        payload: {
          question: 'What is the weather in Tokyo today?',
        },
      });

      expect(answerRes.statusCode).toBe(200);
      const answerJson = JSON.parse(answerRes.body);
      expect(answerJson.data.hasContext).toBe(false);
      expect(answerJson.data.sources.length).toBe(0);
      expect(answerJson.data.answer).toContain('do not have enough relevant documentation');
    });
  });
});