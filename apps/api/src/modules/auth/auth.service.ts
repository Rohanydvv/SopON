import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { prisma } from '@sopon/database';
import { getEnvConfig } from '@sopon/config';
import {
  AuthResponseData,
  AuthSessionUser,
  ErrorCodes,
  LoginRequest,
  MembershipStatus,
  RegisterRequest,
  UserOrganizationMembership,
  UserRole,
} from '@sopon/contracts';

@Injectable()
export class AuthService {
  private readonly config = getEnvConfig();

  async register(data: RegisterRequest): Promise<AuthResponseData> {
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: normalizedEmail },
    });

    if (existingUser) {
      throw new ConflictException({
        code: ErrorCodes.CONFLICT,
        message: 'A user with this email address already exists.',
      });
    }

    const passwordHash = await bcrypt.hash(data.password, 12);
    const orgSlug = this.generateSlug(data.organizationName);

    // Create user, organization, and owner membership in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: normalizedEmail,
          name: data.name.trim(),
          passwordHash,
          status: 'ACTIVE',
        },
      });

      // Ensure unique organization slug
      let finalSlug = orgSlug;
      let counter = 1;
      while (await tx.organization.findUnique({ where: { slug: finalSlug } })) {
        finalSlug = `${orgSlug}-${counter++}`;
      }

      const organization = await tx.organization.create({
        data: {
          name: data.organizationName.trim(),
          slug: finalSlug,
          plan: 'FREE',
        },
      });

      const membership = await tx.membership.create({
        data: {
          organizationId: organization.id,
          userId: user.id,
          role: UserRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      // Log audit event
      await tx.auditLog.create({
        data: {
          organizationId: organization.id,
          actorUserId: user.id,
          action: 'AUTH_REGISTER',
          entityType: 'User',
          entityId: user.id,
          metadataJson: { email: normalizedEmail, orgName: organization.name },
        },
      });

      return { user, organization, membership };
    });

    const tokens = this.generateTokens(result.user);

    const userPayload: AuthSessionUser = {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
    };

    const memberships: UserOrganizationMembership[] = [
      {
        organizationId: result.organization.id,
        organizationName: result.organization.name,
        organizationSlug: result.organization.slug,
        role: result.membership.role as UserRole,
      },
    ];

    return {
      user: userPayload,
      memberships,
      activeOrganizationId: result.organization.id,
      tokens,
    };
  }

  async login(data: LoginRequest): Promise<AuthResponseData> {
    const normalizedEmail = data.email.toLowerCase().trim();

    const user = await prisma.user.findUnique({
      where: { email: normalizedEmail },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      });
    }

    const isPasswordValid = await bcrypt.compare(data.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: ErrorCodes.INVALID_CREDENTIALS,
        message: 'Invalid email or password.',
      });
    }

    const tokens = this.generateTokens(user);

    const memberships: UserOrganizationMembership[] = user.memberships.map((m) => ({
      organizationId: m.organization.id,
      organizationName: m.organization.name,
      organizationSlug: m.organization.slug,
      role: m.role as UserRole,
    }));

    const activeOrganizationId = memberships[0]?.organizationId || '';

    // Log audit event if active org exists
    if (activeOrganizationId) {
      await prisma.auditLog.create({
        data: {
          organizationId: activeOrganizationId,
          actorUserId: user.id,
          action: 'AUTH_LOGIN',
          entityType: 'User',
          entityId: user.id,
        },
      });
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      memberships,
      activeOrganizationId,
      tokens,
    };
  }

  async refreshToken(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
    try {
      const decoded = jwt.verify(refreshToken, this.config.AUTH_SECRET) as {
        sub: string;
        email: string;
        name: string;
        type?: string;
      };

      if (decoded.type !== 'refresh') {
        throw new UnauthorizedException({
          code: ErrorCodes.INVALID_TOKEN,
          message: 'Invalid refresh token type',
        });
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.sub },
      });

      if (!user || user.status !== 'ACTIVE') {
        throw new UnauthorizedException({
          code: ErrorCodes.UNAUTHORIZED,
          message: 'User no longer active',
        });
      }

      const accessToken = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          name: user.name,
          type: 'access',
        },
        this.config.AUTH_SECRET,
        { expiresIn: '15m' },
      );

      return {
        accessToken,
        expiresIn: 15 * 60,
      };
    } catch {
      throw new UnauthorizedException({
        code: ErrorCodes.TOKEN_EXPIRED,
        message: 'Invalid or expired refresh token',
      });
    }
  }

  async getMe(userId: string): Promise<{
    user: AuthSessionUser;
    memberships: UserOrganizationMembership[];
  }> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          include: {
            organization: true,
          },
        },
      },
    });

    if (!user) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'User not found',
      });
    }

    const memberships: UserOrganizationMembership[] = user.memberships.map((m) => ({
      organizationId: m.organization.id,
      organizationName: m.organization.name,
      organizationSlug: m.organization.slug,
      role: m.role as UserRole,
    }));

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
      memberships,
    };
  }

  private generateTokens(user: { id: string; email: string; name: string }) {
    const accessToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        type: 'access',
      },
      this.config.AUTH_SECRET,
      { expiresIn: '15m' },
    );

    const refreshToken = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        name: user.name,
        type: 'refresh',
      },
      this.config.AUTH_SECRET,
      { expiresIn: '7d' },
    );

    return {
      accessToken,
      refreshToken,
      expiresIn: 15 * 60,
    };
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'org';
  }
}