import { Test, TestingModule } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { AppModule } from '../src/app.module';
import { AllExceptionsFilter } from '../src/common/filters/http-exception.filter';
import { TransformInterceptor } from '../src/common/interceptors/transform.interceptor';
import { prisma } from '@sopon/database';
import { UserRole } from '@sopon/contracts';

describe('Authentication, RBAC & Multi-Tenant Isolation E2E Tests', () => {
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
  const aliceEmail = `alice_${timestamp}@sopon.test`;
  const bobEmail = `bob_${timestamp}@sopon.test`;
  const charlieEmail = `charlie_${timestamp}@sopon.test`;

  let aliceToken: string;
  let aliceOrgId: string;

  let bobToken: string;
  let bobOrgId: string;

  let charlieToken: string;
  let charlieMemberId: string;
  let inviteToken: string;

  describe('1. User Registration & Login', () => {
    it('should register Alice and create her default organization as OWNER', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: aliceEmail,
          password: 'Password123!',
          name: 'Alice Cooper',
          organizationName: 'Alice Cloud Ops',
        },
      });

      if (res.statusCode !== 201) { console.error('FAILED BODY:', res.statusCode, res.body); } expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.user.email).toBe(aliceEmail);
      expect(json.data.memberships.length).toBe(1);
      expect(json.data.memberships[0].role).toBe(UserRole.OWNER);
      expect(json.data.tokens.accessToken).toBeDefined();

      aliceToken = json.data.tokens.accessToken;
      aliceOrgId = json.data.activeOrganizationId;
    });

    it('should register Bob and create his separate organization as OWNER', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/register',
        payload: {
          email: bobEmail,
          password: 'Password123!',
          name: 'Bob Marley',
          organizationName: 'Bob Security Labs',
        },
      });

      if (res.statusCode !== 201) { console.error('FAILED BODY:', res.statusCode, res.body); } expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.success).toBe(true);
      expect(json.data.user.email).toBe(bobEmail);

      bobToken = json.data.tokens.accessToken;
      bobOrgId = json.data.activeOrganizationId;
    });

    it('should login Alice successfully and return me profile', async () => {
      const loginRes = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: aliceEmail,
          password: 'Password123!',
        },
      });

      expect(loginRes.statusCode).toBe(200);
      const loginJson = JSON.parse(loginRes.body);
      expect(loginJson.data.tokens.accessToken).toBeDefined();

      const meRes = await app.inject({
        method: 'GET',
        url: '/api/v1/me',
        headers: {
          authorization: `Bearer ${loginJson.data.tokens.accessToken}`,
        },
      });

      expect(meRes.statusCode).toBe(200);
      const meJson = JSON.parse(meRes.body);
      expect(meJson.data.user.email).toBe(aliceEmail);
      expect(meJson.data.memberships.some((m: { organizationId: string }) => m.organizationId === aliceOrgId)).toBe(true);
    });

    it('should reject login with wrong password', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: {
          email: aliceEmail,
          password: 'WrongPassword!',
        },
      });

      expect(res.statusCode).toBe(401);
    });
  });

  describe('2. Multi-Tenant Data Isolation Enforcement', () => {
    it('should allow Alice to get details of her own organization', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${aliceOrgId}`,
        headers: {
          authorization: `Bearer ${aliceToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.id).toBe(aliceOrgId);
      expect(json.data.role).toBe(UserRole.OWNER);
    });

    it('should FORBID Bob from accessing Alice organization (Tenant Isolation)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${aliceOrgId}`,
        headers: {
          authorization: `Bearer ${bobToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('TENANT_MISMATCH');
    });

    it('should FORBID Alice from accessing Bob organization (Tenant Isolation)', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${bobOrgId}`,
        headers: {
          authorization: `Bearer ${aliceToken}`,
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('TENANT_MISMATCH');
    });
  });

  describe('3. Invitations & RBAC Hierarchy Enforcement', () => {
    it('should allow Alice (OWNER) to invite Charlie as VIEWER', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${aliceOrgId}/invitations`,
        headers: {
          authorization: `Bearer ${aliceToken}`,
        },
        payload: {
          email: charlieEmail,
          role: UserRole.VIEWER,
        },
      });

      if (res.statusCode !== 201) { console.error('FAILED BODY:', res.statusCode, res.body); } expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data.email).toBe(charlieEmail);
      expect(json.data.role).toBe(UserRole.VIEWER);
      expect(json.data.inviteToken).toBeDefined();

      inviteToken = json.data.inviteToken;
    });

    it('should allow public verification of invitation token', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/invitations/${inviteToken}`,
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.email).toBe(charlieEmail);
      expect(json.data.organizationId).toBe(aliceOrgId);
    });

    it('should allow Charlie to accept invitation and create account', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/invitations/accept',
        payload: {
          token: inviteToken,
          name: 'Charlie Brown',
          password: 'Password123!',
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.user.email).toBe(charlieEmail);
      expect(json.data.memberships[0].role).toBe(UserRole.VIEWER);

      charlieToken = json.data.tokens.accessToken;
    });

    it('should allow Charlie (VIEWER) to view Alice organization', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${aliceOrgId}`,
        headers: {
          authorization: `Bearer ${charlieToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.role).toBe(UserRole.VIEWER);
    });

    it('should FORBID Charlie (VIEWER) from inviting new members (RBAC)', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${aliceOrgId}/invitations`,
        headers: {
          authorization: `Bearer ${charlieToken}`,
        },
        payload: {
          email: 'another@sopon.test',
          role: UserRole.VIEWER,
        },
      });

      expect(res.statusCode).toBe(403);
      const json = JSON.parse(res.body);
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('should allow Alice (OWNER) to list members and find Charlie', async () => {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${aliceOrgId}/members`,
        headers: {
          authorization: `Bearer ${aliceToken}`,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.length).toBe(2);

      const charlieMember = json.data.find((m: { email: string }) => m.email === charlieEmail);
      expect(charlieMember).toBeDefined();
      expect(charlieMember.role).toBe(UserRole.VIEWER);
      charlieMemberId = charlieMember.id;
    });

    it('should allow Alice (OWNER) to promote Charlie to ADMIN', async () => {
      const res = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${aliceOrgId}/members/${charlieMemberId}`,
        headers: {
          authorization: `Bearer ${aliceToken}`,
        },
        payload: {
          role: UserRole.ADMIN,
        },
      });

      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.body);
      expect(json.data.role).toBe(UserRole.ADMIN);
    });

    it('should allow Charlie (now ADMIN) to invite another member', async () => {
      const res = await app.inject({
        method: 'POST',
        url: `/api/v1/organizations/${aliceOrgId}/invitations`,
        headers: {
          authorization: `Bearer ${charlieToken}`,
        },
        payload: {
          email: 'dave@sopon.test',
          role: UserRole.ENGINEER,
        },
      });

      if (res.statusCode !== 201) { console.error('FAILED BODY:', res.statusCode, res.body); } expect(res.statusCode).toBe(201);
      const json = JSON.parse(res.body);
      expect(json.data.email).toBe('dave@sopon.test');
    });

    it('should prevent Alice from demoting herself if she is the only OWNER', async () => {
      const listRes = await app.inject({
        method: 'GET',
        url: `/api/v1/organizations/${aliceOrgId}/members`,
        headers: {
          authorization: `Bearer ${aliceToken}`,
        },
      });
      const aliceMember = JSON.parse(listRes.body).data.find((m: { email: string }) => m.email === aliceEmail);

      const demoteRes = await app.inject({
        method: 'PATCH',
        url: `/api/v1/organizations/${aliceOrgId}/members/${aliceMember.id}`,
        headers: {
          authorization: `Bearer ${aliceToken}`,
        },
        payload: {
          role: UserRole.ADMIN,
        },
      });

      expect(demoteRes.statusCode).toBe(400);
    });
  });
});