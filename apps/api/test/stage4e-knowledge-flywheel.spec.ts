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
import { PostmortemsService } from '../src/modules/postmortems/postmortems.service';
import { PostmortemQualityGateService } from '../src/modules/postmortems/postmortem-quality-gate.service';
import { SopsService } from '../src/modules/sops/sops.service';
import { CircuitBreakerService } from '../src/modules/circuit-breaker/circuit-breaker.service';

describe('Milestone 4E: Operational Learning & Gated RAG Knowledge Flywheel E2E Tests', () => {
  let app: NestFastifyApplication;
  let postmortemsService: PostmortemsService;
  let qualityGateService: PostmortemQualityGateService;
  let sopsService: SopsService;
  let circuitBreakerService: CircuitBreakerService;

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

    postmortemsService = moduleFixture.get<PostmortemsService>(PostmortemsService);
    qualityGateService = moduleFixture.get<PostmortemQualityGateService>(PostmortemQualityGateService);
    sopsService = moduleFixture.get<SopsService>(SopsService);
    circuitBreakerService = moduleFixture.get<CircuitBreakerService>(CircuitBreakerService);
  });

  afterAll(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const timestamp = Date.now();
  let ownerAToken: string;
  let engineerAToken: string;
  let userAOrgId: string;
  let ownerAUserId: string;
  let engineerAUserId: string;
  let ownerBToken: string;
  let userBOrgId: string;
  let serviceStagingId: string;

  let resolvedIncidentId: string;

  describe('0. Multi-Tenant Organization, Service, and Initial Knowledge Setup', () => {
    it('should setup Org A, Owner A, Engineer A, Services, and Initial Incident', async () => {
      // 1. Register Owner A
      const regRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4e_owner_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org A SRE Lead',
          organizationName: `Stage4E Tenant A ${timestamp}`,
        },
      });
      expect(regRes.statusCode).toBe(201);
      const regJson = JSON.parse(regRes.body);
      ownerAToken = regJson.data.tokens.accessToken;
      userAOrgId = regJson.data.activeOrganizationId;
      ownerAUserId = regJson.data.user.id;

      // 2. Register Engineer A
      const engRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4e_engineer_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org A Engineer',
          organizationName: `Stage4E Eng Tenant ${timestamp}`,
        },
      });
      expect(engRes.statusCode).toBe(201);
      const engJson = JSON.parse(engRes.body);
      engineerAToken = engJson.data.tokens.accessToken;
      engineerAUserId = engJson.data.user.id;

      // Add Engineer A to Org A
      await prisma.membership.create({
        data: {
          organizationId: userAOrgId,
          userId: engineerAUserId,
          role: UserRole.ENGINEER,
        },
      });

      // 3. Create Production Service
      const srvProd = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Checkout API',
          description: 'Production billing service',
          tier: 'Tier 1',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });
      expect(srvProd.statusCode).toBe(201);
      const serviceAId = JSON.parse(srvProd.body).data.id;
      expect(serviceAId).toBeDefined();

      // 4. Create Staging Service
      const srvStaging = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Payment Worker',
          description: 'Staging worker service',
          tier: 'Tier 2',
          environment: ServiceEnvironment.STAGING,
        },
      });
      expect(srvStaging.statusCode).toBe(201);
      serviceStagingId = JSON.parse(srvStaging.body).data.id;
    });

    it('should setup Org B for tenant isolation testing', async () => {
      const regB = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4e_userb_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org B Lead',
          organizationName: `Stage4E Tenant B ${timestamp}`,
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
      const serviceBId = JSON.parse(srvB.body).data.id;
      expect(serviceBId).toBeDefined();
    });
  });

  describe('1. Postmortem Generation & Synthesis', () => {
    it('Scenario 1: should generate structured postmortem from a fully resolved incident', async () => {
      // Create a cleanly resolved incident with timeline and action execution
      const now = new Date();
      const createdAt = new Date(now.getTime() - 20 * 60000);
      const investigatingAt = new Date(now.getTime() - 15 * 60000);
      const resolvedAt = now;

      const inc = await prisma.incident.create({
        data: {
          organizationId: userAOrgId,
          serviceId: serviceStagingId,
          title: 'High HTTP 502 error spike due to Redis connection pool starvation',
          description: 'Checkout worker pool exhausted after flash sale traffic surge.',
          status: IncidentStatus.RESOLVED,
          severity: IncidentSeverity.CRITICAL,
          createdAt,
          investigatingAt,
          resolvedAt,
        },
      });
      resolvedIncidentId = inc.id;

      // Add timeline event with RCA
      await prisma.incidentTimeline.create({
        data: {
          incidentId: inc.id,
          eventType: 'INVESTIGATION_NOTE',
          message: 'Redis Client Connection Pool Exhaustion causing HTTP 502 Bad Gateway timeouts on upstream requests.',
          metadataJson: {
            reasonRca: {
              primaryRootCause: 'Redis Client Connection Pool Exhaustion causing HTTP 502 Bad Gateway timeouts on upstream requests.',
              confidenceScore: 0.94,
              contributingFactors: [
                'Flash sale traffic surge exceeded max concurrent pool allocation',
                'Unclosed idle connections in worker queue',
              ],
            },
          },
          actorUserId: ownerAUserId,
        },
      });

      // Add successful Action Execution with passing verification probes
      const exec = await prisma.actionExecution.create({
        data: {
          organizationId: userAOrgId,
          incidentId: inc.id,
          targetServiceId: serviceStagingId,
          actionType: 'UPDATE_POOL_CONFIG',
          riskTier: 'SAFE_AUTOMATIC',
          status: 'SUCCEEDED',
          isDryRun: false,
          parametersJson: { maxConnections: 250, timeoutMs: 5000 },
          executionOutputJson: {
            action: 'UPDATE_POOL_CONFIG',
            appliedMaxConnections: 250,
            verificationProbes: [
              { probe: 'redis:pool_utilization_percent', passed: true, message: 'Pool utilization dropped to 18%' },
              { probe: 'http:error_rate_percent', passed: true, message: 'HTTP 502 rate normalized to 0.01%' },
            ],
          },
          startedAt: new Date(now.getTime() - 10 * 60000),
          completedAt: new Date(now.getTime() - 8 * 60000),
          verifiedAt: new Date(now.getTime() - 5 * 60000),
          actorUserId: ownerAUserId,
        },
      });
      expect(exec.id).toBeDefined();

      // Generate Postmortem via API
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/incidents/${inc.id}/postmortem/generate`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { customNotes: 'Verified during production flash sale drill' },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data.incidentId).toBe(inc.id);
      expect(json.data.title).toContain('High HTTP 502');
      expect(json.data.rootCause).toContain('Redis Client Connection Pool');
      expect(json.data.remediationAction).toBe('UPDATE_POOL_CONFIG');
      expect(json.data.remediationSteps.length).toBeGreaterThanOrEqual(3);
      expect(json.data.preventionItems.length).toBeGreaterThanOrEqual(3);
      expect(json.data.detectionTimeMinutes).toBeGreaterThanOrEqual(1);
      expect(json.data.resolutionTimeMinutes).toBeGreaterThanOrEqual(1);
      expect(json.data.qualityScore).toBeGreaterThanOrEqual(0.85);
    });
  });

  describe('2. Deterministic 8-Point Postmortem Quality Gate Validation', () => {
    it('Scenario 2: should PASS all 8 deterministic checks on cleanly resolved incident', async () => {
      const result = await qualityGateService.evaluateGate(userAOrgId, resolvedIncidentId);
      expect(result.passed).toBe(true);
      expect(result.qualityScore).toBe(1.0);
      expect(result.checks).toHaveLength(8);
      expect(result.checks.every((c) => c.passed)).toBe(true);
      expect(result.recommendation).toBe('AUTO_APPROVE');
    });

    it('Scenario 3: should FAIL Gate 1 when incident is unresolved (status == OPEN)', async () => {
      const openInc = await prisma.incident.create({
        data: {
          organizationId: userAOrgId,
          serviceId: serviceStagingId,
          title: 'Unresolved active incident testing Gate 1',
          description: 'Incident still ongoing',
          status: IncidentStatus.INVESTIGATING,
          severity: IncidentSeverity.HIGH,
        },
      });

      const result = await qualityGateService.evaluateGate(userAOrgId, openInc.id);
      expect(result.passed).toBe(false);
      expect(result.recommendation).toBe('REJECT');
      const gate1 = result.checks.find((c) => c.checkNumber === 1);
      expect(gate1!.passed).toBe(false);
      expect(gate1!.reason).toContain('must be RESOLVED');
    });

    it('Scenario 4: should FAIL Gate 4 when action was rolled back (Zero Positive Knowledge for Rollbacks)', async () => {
      const rollbackInc = await prisma.incident.create({
        data: {
          organizationId: userAOrgId,
          serviceId: serviceStagingId,
          title: 'Incident with rolled back remediation action',
          description: 'Testing rollback quality gate rejection',
          status: IncidentStatus.RESOLVED,
          severity: IncidentSeverity.CRITICAL,
          resolvedAt: new Date(),
        },
      });

      // Add ROLLED_BACK execution
      await prisma.actionExecution.create({
        data: {
          organizationId: userAOrgId,
          incidentId: rollbackInc.id,
          targetServiceId: serviceStagingId,
          actionType: 'SCALE_SERVICE_REPLICAS',
          riskTier: 'SAFE_AUTOMATIC',
          status: 'ROLLED_BACK',
          rollbackStatus: 'EXECUTED',
          isDryRun: false,
          parametersJson: { targetReplicas: 5 },
          errorMessage: 'Verification probe timed out; automated rollback executed',
        },
      });

      const result = await qualityGateService.evaluateGate(userAOrgId, rollbackInc.id);
      expect(result.passed).toBe(false);
      expect(result.recommendation).toBe('REJECT');
      const gate4 = result.checks.find((c) => c.checkNumber === 4);
      expect(gate4!.passed).toBe(false);
      expect(gate4!.reason).toContain('Automatic rollback occurred');
    });

    it('Scenario 5: should FAIL Gate 3 when verification probes failed on action', async () => {
      const failedProbeInc = await prisma.incident.create({
        data: {
          organizationId: userAOrgId,
          serviceId: serviceStagingId,
          title: 'Incident with failing readiness probes',
          description: 'Testing failed probe check',
          status: IncidentStatus.RESOLVED,
          severity: IncidentSeverity.HIGH,
          resolvedAt: new Date(),
        },
      });

      await prisma.actionExecution.create({
        data: {
          organizationId: userAOrgId,
          incidentId: failedProbeInc.id,
          targetServiceId: serviceStagingId,
          actionType: 'RESTART_SERVICE_WORKER',
          riskTier: 'SAFE_AUTOMATIC',
          status: 'SUCCEEDED',
          isDryRun: false,
          parametersJson: { gracePeriodSeconds: 30 },
          executionOutputJson: {
            verificationProbes: [
              { probe: 'http:health', passed: false, message: '503 Service Unavailable' },
            ],
          },
        },
      });

      const result = await qualityGateService.evaluateGate(userAOrgId, failedProbeInc.id);
      expect(result.passed).toBe(false);
      const gate3 = result.checks.find((c) => c.checkNumber === 3);
      expect(gate3!.passed).toBe(false);
      expect(gate3!.reason).toContain('verification probes failed');
    });

    it('Scenario 6: should flag soft failure (NEEDS_REVIEW) when RCA confidence is marginal / novel incident', async () => {
      const novelInc = await prisma.incident.create({
        data: {
          organizationId: userAOrgId,
          serviceId: serviceStagingId,
          title: 'Novel cosmic ray incident with low confidence',
          description: 'Unexplained hardware anomaly',
          status: IncidentStatus.RESOLVED,
          severity: IncidentSeverity.LOW,
          resolvedAt: new Date(),
        },
      });

      await prisma.actionExecution.create({
        data: {
          organizationId: userAOrgId,
          incidentId: novelInc.id,
          targetServiceId: serviceStagingId,
          actionType: 'RESTART_SERVICE_WORKER',
          riskTier: 'SAFE_AUTOMATIC',
          status: 'SUCCEEDED',
          isDryRun: false,
          parametersJson: { gracePeriodSeconds: 30 },
          verifiedAt: new Date(),
          executionOutputJson: {
            verificationProbes: [{ probe: 'health', passed: true }],
          },
        },
      });

      await prisma.aIAnalysis.create({
        data: {
          organizationId: userAOrgId,
          incidentId: novelInc.id,
          type: 'RCA',
          status: 'COMPLETED',
          model: 'gemini-1.5-pro',
          promptVersion: 'v1',
          inputHash: 'hash123',
          outputJson: {
            reasonRca: {
              primaryRootCause: 'Unclassified memory anomaly',
              confidenceScore: 0.45,
            },
          },
        },
      });

      const result = await qualityGateService.evaluateGate(userAOrgId, novelInc.id);
      expect(result.passed).toBe(false);
      expect(result.recommendation).toBe('NEEDS_HUMAN_REVIEW');
      const gate7 = result.checks.find((c) => c.checkNumber === 7);
      expect(gate7!.passed).toBe(false);
      expect(gate7!.reason).toContain('below 80% threshold');
    });

    it('Scenario 7: should flag soft failure (NEEDS_REVIEW) when service circuit breaker has active strikes', async () => {
      // Record a strike on service
      await circuitBreakerService.recordStrike(userAOrgId, serviceStagingId, 'Flapping probe failure');

      const result = await qualityGateService.evaluateGate(userAOrgId, resolvedIncidentId);
      const gate8 = result.checks.find((c) => c.checkNumber === 8);
      expect(gate8!.passed).toBe(false);
      expect(gate8!.reason).toContain('active strike(s)');

      // Reset circuit breaker for clean baseline
      await prisma.serviceCircuitBreaker.update({
        where: { serviceId: serviceStagingId },
        data: { failureStrikes: 0, state: 'CLOSED' },
      });
    });
  });

  describe('3. Approval Lifecycle, Auto-Indexing & Policy Enforcement', () => {
    it('Scenario 8: should automatically approve and INDEX postmortem when policy allows auto-indexing', async () => {
      // Ensure policy has autoIndexVerifiedPostmortems = true
      await prisma.organizationRemediationPolicy.upsert({
        where: { organizationId: userAOrgId },
        create: {
          organizationId: userAOrgId,
          autoIndexVerifiedPostmortems: true,
        },
        update: {
          autoIndexVerifiedPostmortems: true,
        },
      });

      const postmortem = await postmortemsService.generatePostmortem(
        userAOrgId,
        resolvedIncidentId,
        ownerAUserId,
      );

      expect(postmortem.status).toBe('INDEXED');
      expect(postmortem.isAuthoritative).toBe(true);
      expect(postmortem.documentId).not.toBeNull();

      // Verify KnowledgeDocument created
      const doc = await prisma.knowledgeDocument.findUnique({
        where: { id: postmortem.documentId! },
      });
      expect(doc).not.toBeNull();
      expect(doc!.sourceType).toBe('POSTMORTEM');
      expect(doc!.status).toBe('ACTIVE');
      expect(doc!.isAuthoritative).toBe(true);
    });

    it('Scenario 9: should require human review when organization policy disables auto-indexing', async () => {
      // Disable auto-index policy
      await prisma.organizationRemediationPolicy.update({
        where: { organizationId: userAOrgId },
        data: { autoIndexVerifiedPostmortems: false },
      });

      // Create another clean resolved incident
      const inc = await prisma.incident.create({
        data: {
          organizationId: userAOrgId,
          serviceId: serviceStagingId,
          title: 'Worker pod thread pool saturation resolved by replica scaling',
          description: 'Scaled to 4 replicas under heavy load.',
          status: IncidentStatus.RESOLVED,
          severity: IncidentSeverity.HIGH,
          resolvedAt: new Date(),
        },
      });

      await prisma.actionExecution.create({
        data: {
          organizationId: userAOrgId,
          incidentId: inc.id,
          targetServiceId: serviceStagingId,
          actionType: 'SCALE_SERVICE_REPLICAS',
          status: 'SUCCEEDED',
          isDryRun: false,
          parametersJson: { targetReplicas: 4 },
          verifiedAt: new Date(),
          executionOutputJson: {
            verificationProbes: [{ probe: 'k8s:replicas', passed: true }],
          },
        },
      });

      const postmortem = await postmortemsService.generatePostmortem(
        userAOrgId,
        inc.id,
        ownerAUserId,
      );

      expect(postmortem.status).toBe('NEEDS_REVIEW');
      expect(postmortem.isAuthoritative).toBe(false);
      expect(postmortem.documentId).toBeNull();
    });

    it('Scenario 10: should enforce RBAC: Engineer review fails (403), Owner review succeeds (200)', async () => {
      // Get the NEEDS_REVIEW postmortem
      const pmList = await postmortemsService.listPostmortems(userAOrgId, { status: 'NEEDS_REVIEW' });
      expect(pmList.length).toBeGreaterThanOrEqual(1);
      const targetPm = pmList[0]!;

      // 1. Engineer attempts to approve postmortem -> 403 Forbidden
      const engRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/postmortems/${targetPm.id}/review`,
        headers: { authorization: `Bearer ${engineerAToken}` },
        payload: { status: 'APPROVED', reviewNotes: 'Engineer trying to approve' },
      });
      expect(engRes.statusCode).toBe(403);

      // 2. Owner approves postmortem -> 200 OK
      const ownerRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/postmortems/${targetPm.id}/review`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { status: 'APPROVED', reviewNotes: 'Approved by SRE Lead after verification' },
      });
      expect(ownerRes.statusCode).toBe(200);
      const json = JSON.parse(ownerRes.body);
      expect(json.data.status).toBe('INDEXED');
      expect(json.data.isAuthoritative).toBe(true);
      expect(json.data.documentId).not.toBeNull();
    });
  });

  describe('4. pgvector Knowledge Ingestion & Grounded RAG Retrieval', () => {
    it('Scenario 11: should verify indexed postmortem chunks exist in knowledge_chunks with vector embeddings', async () => {
      const pm = await postmortemsService.getPostmortemByIncidentId(userAOrgId, resolvedIncidentId);
      expect(pm.documentId).not.toBeNull();

      const chunks = await prisma.knowledgeChunk.findMany({
        where: { documentId: pm.documentId! },
      });
      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0]?.content).toContain('Redis Client Connection Pool');
    });

    it('Scenario 12: should retrieve approved postmortem in RAG search with boosted quality score', async () => {
      const query = 'HTTP 502 bad gateway Redis connection pool starvation on worker';
      const results = await sopsService.ragSearch(userAOrgId, query, 5, 0.1, serviceStagingId);

      expect(results.length).toBeGreaterThanOrEqual(1);
      const pmMatch = results.find((r) => r.sourceType === 'POSTMORTEM');
      expect(pmMatch).toBeDefined();
      expect(pmMatch!.similarityScore).toBeGreaterThanOrEqual(0.50);
      expect(pmMatch!.documentTitle).toContain('High HTTP 502');
    });

    it('Scenario 13: should strictly EXCLUDE unapproved / rejected postmortems from RAG search', async () => {
      // Create a rejected postmortem document
      const rejDoc = await prisma.knowledgeDocument.create({
        data: {
          organizationId: userAOrgId,
          serviceId: serviceStagingId,
          title: 'Unverified Bad Remedy: Restart Redis Server Directly',
          sourceType: 'POSTMORTEM',
          status: 'DEPRECATED',
          isAuthoritative: false,
          content: 'Unapproved recommendation that should never be retrieved',
          tags: ['redis', 'unverified'],
        },
      });

      await sopsService.indexDocumentChunksPublic(
        rejDoc.id,
        userAOrgId,
        'Unverified Bad Remedy: Restart Redis Server Directly on hardware host',
      );

      // Query RAG
      const results = await sopsService.ragSearch(
        userAOrgId,
        'Restart Redis Server Directly on hardware host',
        5,
        0.05,
      );

      const foundRejected = results.some((r) => r.documentId === rejDoc.id);
      expect(foundRejected).toBe(false);
    });
  });

  describe('5. Knowledge Invalidation, Deprecation & Anti-Drift', () => {
    it('Scenario 14: should manually deprecate a postmortem and exclude it from active RAG immediately', async () => {
      const pm = await postmortemsService.getPostmortemByIncidentId(userAOrgId, resolvedIncidentId);
      expect(pm.documentId).not.toBeNull();

      // Deprecate via API
      const depRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/postmortems/${pm.id}/deprecate`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { reason: 'Architecture evolved: Redis replaced with Managed Dragonfly Cluster' },
      });
      expect(depRes.statusCode).toBe(200);
      const json = JSON.parse(depRes.body);
      expect(json.data.status).toBe('DEPRECATED');
      expect(json.data.isAuthoritative).toBe(false);
      expect(json.data.deprecatedReason).toContain('Dragonfly');

      // Verify KnowledgeDocument is marked DEPRECATED
      const doc = await prisma.knowledgeDocument.findUnique({
        where: { id: pm.documentId! },
      });
      expect(doc!.status).toBe('DEPRECATED');
      expect(doc!.isAuthoritative).toBe(false);

      // Verify RAG search excludes it
      const searchAfterDep = await sopsService.ragSearch(
        userAOrgId,
        'HTTP 502 bad gateway Redis connection pool starvation on worker',
        5,
        0.1,
      );
      const foundDeprecated = searchAfterDep.some((r) => r.documentId === pm.documentId);
      expect(foundDeprecated).toBe(false);
    });

    it('Scenario 15: should verify failed/rolled back remediation history remains preserved for audit without becoming active knowledge', async () => {
      const rolledBackExecs = await prisma.actionExecution.findMany({
        where: { organizationId: userAOrgId, status: 'ROLLED_BACK' },
      });
      expect(rolledBackExecs.length).toBeGreaterThanOrEqual(1);

      // Verify none of the rolled back executions are linked to an ACTIVE authoritative KnowledgeDocument
      const activeDocs = await prisma.knowledgeDocument.findMany({
        where: { organizationId: userAOrgId, status: 'ACTIVE' },
      });

      for (const exec of rolledBackExecs) {
        const matchingDoc = activeDocs.find((d) => d.incidentId === exec.incidentId);
        expect(matchingDoc).toBeUndefined();
      }
    });
  });

  describe('6. Strict Multi-Tenant Isolation & Zero Secret Exposure', () => {
    it('Scenario 16: should forbid Org B from accessing Org A postmortems, and verify zero secret leakage', async () => {
      const pm = await postmortemsService.getPostmortemByIncidentId(userAOrgId, resolvedIncidentId);

      // 1. Org B attempts to get Org A postmortem -> 404 Not Found
      const getRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userBOrgId}/postmortems/${pm.id}`,
        headers: { authorization: `Bearer ${ownerBToken}` },
      });
      expect(getRes.statusCode).toBe(404);

      // 2. Org B attempts to review Org A postmortem -> 404 Not Found
      const revRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userBOrgId}/postmortems/${pm.id}/review`,
        headers: { authorization: `Bearer ${ownerBToken}` },
        payload: { status: 'APPROVED' },
      });
      expect(revRes.statusCode).toBe(404);

      // 3. Verify zero secrets leaked in postmortem records
      const allPms = await prisma.postmortem.findMany({
        where: { organizationId: userAOrgId },
      });
      for (const p of allPms) {
        const serialized = JSON.stringify(p);
        expect(serialized).not.toContain('sopon_secret');
        expect(serialized).not.toContain('k8s-secret-service-token');
        expect(serialized).not.toContain('Password123!');
      }
    });
  });
});
