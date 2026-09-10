import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { prisma } from '@sopon/database';
import { ServiceEnvironment, UserRole } from '@sopon/contracts';

describe('Milestone 4B: KMS Credential Vault & Envelope Encryption E2E Tests', () => {
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
  let ownerAToken: string;
  let engineerAToken: string;
  let userAOrgId: string;
  let serviceAId: string;

  let ownerBToken: string;
  let userBOrgId: string;

  let k8sCredId: string;
  let redisCredId: string;

  describe('0. Setup Multi-Tenant Orgs, RBAC Users, and Services', () => {
    it('should setup Org A with Owner and Engineer users', async () => {
      // 1. Owner A
      const regOwner = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4b_owner_a_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org A Owner',
          organizationName: `Stage4B Vault Org ${timestamp}`,
        },
      });

      expect(regOwner.statusCode).toBe(201);
      const jsonOwner = JSON.parse(regOwner.body);
      ownerAToken = jsonOwner.data.tokens.accessToken;
      userAOrgId = jsonOwner.data.activeOrganizationId;

      // 2. Engineer A (via invitation)
      const invRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/invitations`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          email: `m4b_eng_a_${timestamp}@sopon.test`,
          role: UserRole.ENGINEER,
        },
      });
      expect(invRes.statusCode).toBe(201);
      const inviteToken = JSON.parse(invRes.body).data.inviteToken;

      const acceptRes = await app.inject({
        method: 'POST',
        url: '/api/v1/invitations/accept',
        payload: {
          token: inviteToken,
          name: 'Org A Engineer',
          password: 'Password123!',
        },
      });
      expect(acceptRes.statusCode).toBe(200);
      engineerAToken = JSON.parse(acceptRes.body).data.tokens.accessToken;

      // 3. Service A
      const srvA = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/services`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Payment Processing Service',
          tier: 'Tier 1',
          environment: ServiceEnvironment.PRODUCTION,
        },
      });
      expect(srvA.statusCode).toBe(201);
      serviceAId = JSON.parse(srvA.body).data.id;
    });

    it('should setup Org B for tenant isolation testing', async () => {
      const regB = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: `m4b_owner_b_${timestamp}@sopon.test`,
          password: 'Password123!',
          name: 'Org B Owner',
          organizationName: `Stage4B Tenant B ${timestamp}`,
        },
      });

      expect(regB.statusCode).toBe(201);
      const jsonB = JSON.parse(regB.body);
      ownerBToken = jsonB.data.tokens.accessToken;
      userBOrgId = jsonB.data.activeOrganizationId;
      expect(userBOrgId).toBeDefined();
    });
  });

  describe('1. Envelope Encryption Storage & Secret Protection', () => {
    it('Scenario 1: should store encrypted Kubernetes Kubeconfig credential via envelope encryption', async () => {
      const kubeconfigSecret = {
        clusterEndpoint: 'https://k8s-prod.company.internal:6443',
        clientCertificateData: 'LS0tLS1CRUdJTiBDRVJUSUZJQ0FURS0tLS0tCg==',
        clientKeyData: 'LS0tLS1CRUdJTiBSU0EgUFJJVkFURSBLRVktLS0tLQo=',
        token: 'eyJhGciOiJSUzI1NiIsImtpZCI6InByb2Qta3MifQ.k8s-service-token-secret-data',
      };

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Production Kubernetes Cluster Credentials',
          targetType: 'KUBERNETES',
          environment: ServiceEnvironment.PRODUCTION,
          serviceId: serviceAId,
          secretPayload: kubeconfigSecret,
          metadataJson: {
            clusterName: 'k8s-prod-us-east-1',
            region: 'us-east-1',
            nodeCount: 24,
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data.id).toBeDefined();
      expect(json.data.name).toBe('Production Kubernetes Cluster Credentials');
      expect(json.data.targetType).toBe('KUBERNETES');
      expect(json.data.environment).toBe('PRODUCTION');
      expect(json.data.hasSecret).toBe(true);
      expect(json.data.keyFingerprint).toBeDefined();
      expect(json.data.keyVersion).toBe(1);
      expect(json.data.secretPayload).toBeUndefined(); // Plaintext secret MUST NOT be returned in metadata response

      k8sCredId = json.data.id;
    });

    it('Scenario 2: should store encrypted Redis connection credentials', async () => {
      const redisSecret = {
        host: 'redis-cluster-prod.company.internal',
        port: 6379,
        password: 'super-secure-production-redis-password-9988',
        db: 0,
      };

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: {
          name: 'Payment Redis Cache Cluster',
          targetType: 'REDIS',
          environment: ServiceEnvironment.PRODUCTION,
          serviceId: serviceAId,
          secretPayload: redisSecret,
          metadataJson: {
            maxConnections: 1000,
            tlsEnabled: true,
          },
        },
      });

      expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      redisCredId = json.data.id;
    });

    it('Scenario 3: verify ZERO PLAINTEXT in database records at rest', async () => {
      const dbCred = await prisma.vaultCredential.findUnique({
        where: { id: k8sCredId },
      });

      expect(dbCred).toBeDefined();
      // Ciphertext must exist and be non-empty base64/hex
      expect(dbCred!.encryptedDek).toBeDefined();
      expect(dbCred!.encryptedDek.length).toBeGreaterThan(20);
      expect(dbCred!.encryptedData).toBeDefined();
      expect(dbCred!.encryptedData.length).toBeGreaterThan(20);
      expect(dbCred!.ivHex).toBeDefined();
      expect(dbCred!.ivHex.length).toBe(24); // 12 bytes = 24 hex chars
      expect(dbCred!.authTagHex).toBeDefined();
      expect(dbCred!.authTagHex.length).toBe(32); // 16 bytes = 32 hex chars

      // Ensure plaintext tokens or passwords are NEVER in raw DB columns
      expect(JSON.stringify(dbCred)).not.toContain('k8s-service-token-secret-data');
      expect(JSON.stringify(dbCred)).not.toContain('super-secure-production-redis-password');
    });

    it('Scenario 4: should list credential metadata without exposing plaintext secrets', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/vault`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.length).toBe(2);

      for (const item of json.data) {
        expect(item.hasSecret).toBe(true);
        expect(item.secretPayload).toBeUndefined();
        expect(item.encryptedData).toBeUndefined();
        expect(item.encryptedDek).toBeUndefined();
        expect(item.ivHex).toBeUndefined();
        expect(item.authTagHex).toBeUndefined();
      }
    });
  });

  describe('2. Authorized Decryption & RBAC Access Control', () => {
    it('Scenario 5: should allow OWNER to perform authorized decryption of credentials', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/${k8sCredId}/decrypt`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.id).toBe(k8sCredId);
      expect(json.data.decryptedPayload).toBeDefined();
      expect(json.data.decryptedPayload.token).toBe('eyJhGciOiJSUzI1NiIsImtpZCI6InByb2Qta3MifQ.k8s-service-token-secret-data');
      expect(json.data.decryptedPayload.clusterEndpoint).toBe('https://k8s-prod.company.internal:6443');
    });

    it('Scenario 6: should FORBID ENGINEER from decrypting credentials (RBAC restriction)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/${k8sCredId}/decrypt`,
        headers: { authorization: `Bearer ${engineerAToken}` },
      });

      expect(res.statusCode).toBe(403);
    });

    it('Scenario 7: should allow ENGINEER to view metadata only', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/vault/${k8sCredId}`,
        headers: { authorization: `Bearer ${engineerAToken}` },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.name).toBe('Production Kubernetes Cluster Credentials');
      expect(json.data.hasSecret).toBe(true);
      expect(json.data.secretPayload).toBeUndefined();
    });

    it('Scenario 8: should FORBID Org B from listing, reading, or decrypting Org A credentials (Tenant Isolation)', async () => {
      // 1. List
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/vault`,
        headers: { authorization: `Bearer ${ownerBToken}` },
      });
      expect(listRes.statusCode).toBe(403);

      // 2. Read metadata
      const readRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${userAOrgId}/vault/${k8sCredId}`,
        headers: { authorization: `Bearer ${ownerBToken}` },
      });
      expect(readRes.statusCode).toBe(403);

      // 3. Decrypt
      const decryptRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/${k8sCredId}/decrypt`,
        headers: { authorization: `Bearer ${ownerBToken}` },
      });
      expect(decryptRes.statusCode).toBe(403);
    });
  });

  describe('3. Cryptographic Tamper & Integrity Protection', () => {
    it('Scenario 9: should FAIL decryption if authentication tag is TAMPERED in database', async () => {
      // Temporarily tamper auth tag in database
      const originalCred = await prisma.vaultCredential.findUnique({ where: { id: redisCredId } });
      await prisma.vaultCredential.update({
        where: { id: redisCredId },
        data: { authTagHex: '00112233445566778899aabbccddeeff' },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/${redisCredId}/decrypt`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(res.statusCode).toBe(400);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('AUTHENTICATION_TAG_VERIFICATION_FAILED');

      // Restore original auth tag
      await prisma.vaultCredential.update({
        where: { id: redisCredId },
        data: { authTagHex: originalCred!.authTagHex },
      });
    });

    it('Scenario 10: should FAIL decryption if ciphertext is corrupted', async () => {
      const originalCred = await prisma.vaultCredential.findUnique({ where: { id: redisCredId } });
      await prisma.vaultCredential.update({
        where: { id: redisCredId },
        data: { encryptedData: Buffer.from('corrupted-non-aes-gcm-data').toString('base64') },
      });

      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/${redisCredId}/decrypt`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).error.code).toBe('AUTHENTICATION_TAG_VERIFICATION_FAILED');

      // Restore
      await prisma.vaultCredential.update({
        where: { id: redisCredId },
        data: { encryptedData: originalCred!.encryptedData },
      });
    });
  });

  describe('4. Credential Rotation & Master Key (KEK) Rotation', () => {
    it('Scenario 11: should rotate credential secret payload and verify updated decryption', async () => {
      const updatedRedisSecret = {
        host: 'redis-cluster-prod.company.internal',
        port: 6379,
        password: 'NEW-ROTATED-redis-password-2026-xyz',
        db: 0,
      };

      const rotateRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/${redisCredId}/rotate`,
        headers: { authorization: `Bearer ${ownerAToken}` },
        payload: { newSecretPayload: updatedRedisSecret },
      });

      expect(rotateRes.statusCode).toBe(200);
      const rotateJson = JSON.parse(rotateRes.body);
      expect(rotateJson.data.hasSecret).toBe(true);

      // Decrypt and verify new secret
      const decryptRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/${redisCredId}/decrypt`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(decryptRes.statusCode).toBe(200);
      const decryptJson = JSON.parse(decryptRes.body);
      expect(decryptJson.data.decryptedPayload.password).toBe('NEW-ROTATED-redis-password-2026-xyz');
    });

    it('Scenario 12: should rotate KMS Master Key and re-encrypt all stored DEKs', async () => {
      const rotateMasterRes = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/master-key/rotate`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(rotateMasterRes.statusCode).toBe(200);
      const rotateJson = JSON.parse(rotateMasterRes.body);
      expect(rotateJson.data.newKeyVersion).toBe(2);
      expect(rotateJson.data.credentialsUpdated).toBeGreaterThanOrEqual(2);

      // Verify records in database have keyVersion = 2
      const updatedCreds = await prisma.vaultCredential.findMany({
        where: { organizationId: userAOrgId },
      });
      for (const cred of updatedCreds) {
        expect(cred.keyVersion).toBe(2);
      }

      // Verify decryption STILL SUCCEEDS under Master Key Version 2
      const decryptK8s = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/${k8sCredId}/decrypt`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });
      expect(decryptK8s.statusCode).toBe(200);
      expect(JSON.parse(decryptK8s.body).data.decryptedPayload.clusterEndpoint).toBe('https://k8s-prod.company.internal:6443');
    });
  });

  describe('5. Revocation, Deletion & Audit Trail', () => {
    it('Scenario 13: should delete and revoke credential, preventing future decryption', async () => {
      const delRes = await app.inject({
        method: 'DELETE',
        url: `/api/v1/organizations/${userAOrgId}/vault/${redisCredId}`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });

      expect(delRes.statusCode).toBe(200);

      // Attempting to decrypt deleted credential returns 404
      const decryptAfterDelete = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${userAOrgId}/vault/${redisCredId}/decrypt`,
        headers: { authorization: `Bearer ${ownerAToken}` },
      });
      expect(decryptAfterDelete.statusCode).toBe(404);
    });

    it('Scenario 14: should verify immutable audit log records for all vault events', async () => {
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          organizationId: userAOrgId,
          entityType: { in: ['VaultCredential', 'KmsProvider'] },
        },
        orderBy: { createdAt: 'desc' },
      });

      expect(auditLogs.length).toBeGreaterThanOrEqual(4);
      const actions = auditLogs.map((a) => a.action);
      expect(actions).toContain('VAULT_CREDENTIAL_STORED');
      expect(actions).toContain('VAULT_CREDENTIAL_DECRYPTED');
      expect(actions).toContain('VAULT_MASTER_KEY_ROTATED');
      expect(actions).toContain('VAULT_CREDENTIAL_DELETED');

      // Verify secrets are NEVER present in audit metadata
      for (const log of auditLogs) {
        const metadataStr = JSON.stringify(log.metadataJson);
        expect(metadataStr).not.toContain('k8s-service-token-secret-data');
        expect(metadataStr).not.toContain('super-secure-production-redis-password');
        expect(metadataStr).not.toContain('NEW-ROTATED-redis-password');
      }
    });
  });
});
