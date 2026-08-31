import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { prisma } from '@sopon/database';
import { getEnvConfig } from '@sopon/config';
import {
  AcceptInvitationRequest,
  AuthResponseData,
  CreateInvitationRequest,
  ErrorCodes,
  InvitationResponse,
  MembershipStatus,
  UserRole,
} from '@sopon/contracts';

@Injectable()
export class InvitationsService {
  private readonly config = getEnvConfig();

  async createInvitation(
    orgId: string,
    data: CreateInvitationRequest,
    actorUserId: string,
  ): Promise<InvitationResponse & { inviteToken: string }> {
    const normalizedEmail = data.email.toLowerCase().trim();

    // Check if user is already an active member
    const existingMembership = await prisma.membership.findFirst({
      where: {
        organizationId: orgId,
        user: { email: normalizedEmail },
        status: MembershipStatus.ACTIVE,
      },
    });

    if (existingMembership) {
      throw new ConflictException({
        code: ErrorCodes.CONFLICT,
        message: 'A user with this email is already an active member of this organization.',
      });
    }

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException({
        code: ErrorCodes.ORGANIZATION_NOT_FOUND,
        message: 'Organization not found',
      });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    // Delete previous pending invitation for same email in this org if any
    await prisma.invitation.deleteMany({
      where: {
        organizationId: orgId,
        email: normalizedEmail,
        acceptedAt: null,
      },
    });

    const invitation = await prisma.invitation.create({
      data: {
        organizationId: orgId,
        email: normalizedEmail,
        role: data.role,
        tokenHash,
        expiresAt,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'INVITATION_CREATE',
        entityType: 'Invitation',
        entityId: invitation.id,
        metadataJson: { email: normalizedEmail, role: data.role },
      },
    });

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as UserRole,
      organizationId: org.id,
      organizationName: org.name,
      organizationSlug: org.slug,
      expiresAt: invitation.expiresAt.toISOString(),
      inviteToken: rawToken,
    };
  }

  async getInvitationByToken(rawToken: string): Promise<InvitationResponse> {
    const tokenHash = this.hashToken(rawToken);

    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: { organization: true },
    });

    if (!invitation || invitation.acceptedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Invitation not found or has already been accepted.',
      });
    }

    if (new Date() > invitation.expiresAt) {
      throw new BadRequestException({
        code: ErrorCodes.TOKEN_EXPIRED,
        message: 'Invitation token has expired. Please request a new invitation.',
      });
    }

    return {
      id: invitation.id,
      email: invitation.email,
      role: invitation.role as UserRole,
      organizationId: invitation.organization.id,
      organizationName: invitation.organization.name,
      organizationSlug: invitation.organization.slug,
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async acceptInvitation(
    data: AcceptInvitationRequest,
  ): Promise<AuthResponseData> {
    const tokenHash = this.hashToken(data.token);

    const invitation = await prisma.invitation.findUnique({
      where: { tokenHash },
      include: { organization: true },
    });

    if (!invitation || invitation.acceptedAt !== null) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Invitation not found or has already been accepted.',
      });
    }

    if (new Date() > invitation.expiresAt) {
      throw new BadRequestException({
        code: ErrorCodes.TOKEN_EXPIRED,
        message: 'Invitation token has expired.',
      });
    }

    const email = invitation.email.toLowerCase().trim();

    // Check if user already exists
    let user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      if (!data.password || data.password.length < 8) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Password (at least 8 characters) is required to create your account.',
        });
      }

      const passwordHash = await bcrypt.hash(data.password, 12);
      user = await prisma.user.create({
        data: {
          email,
          name: data.name?.trim() || email.split('@')[0] || 'User',
          passwordHash,
          status: 'ACTIVE',
        },
      });
    }

    // Attach membership and mark invitation accepted in a transaction
    await prisma.$transaction(async (tx) => {
      await tx.membership.upsert({
        where: {
          organizationId_userId: {
            organizationId: invitation.organizationId,
            userId: user.id,
          },
        },
        create: {
          organizationId: invitation.organizationId,
          userId: user.id,
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
        },
        update: {
          role: invitation.role,
          status: MembershipStatus.ACTIVE,
        },
      });

      await tx.invitation.update({
        where: { id: invitation.id },
        data: { acceptedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          organizationId: invitation.organizationId,
          actorUserId: user.id,
          action: 'INVITATION_ACCEPT',
          entityType: 'Membership',
          entityId: invitation.id,
          metadataJson: { email, role: invitation.role },
        },
      });
    });

    // Load full user with all active memberships
    const fullUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      include: {
        memberships: {
          where: { status: MembershipStatus.ACTIVE },
          include: { organization: true },
        },
      },
    });

    const accessToken = jwt.sign(
      {
        sub: fullUser.id,
        email: fullUser.email,
        name: fullUser.name,
        type: 'access',
      },
      this.config.AUTH_SECRET,
      { expiresIn: '15m' },
    );

    const refreshToken = jwt.sign(
      {
        sub: fullUser.id,
        email: fullUser.email,
        name: fullUser.name,
        type: 'refresh',
      },
      this.config.AUTH_SECRET,
      { expiresIn: '7d' },
    );

    const memberships = fullUser.memberships.map((m) => ({
      organizationId: m.organization.id,
      organizationName: m.organization.name,
      organizationSlug: m.organization.slug,
      role: m.role as UserRole,
    }));

    return {
      user: {
        id: fullUser.id,
        email: fullUser.email,
        name: fullUser.name,
      },
      memberships,
      activeOrganizationId: invitation.organizationId,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: 15 * 60,
      },
    };
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}