import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  ErrorCodes,
  MemberResponse,
  MembershipStatus,
  UpdateMemberRoleRequest,
  UserRole,
} from '@sopon/contracts';

@Injectable()
export class MembersService {
  async listMembers(orgId: string): Promise<MemberResponse[]> {
    const memberships = await prisma.membership.findMany({
      where: {
        organizationId: orgId,
        status: MembershipStatus.ACTIVE,
      },
      include: {
        user: true,
      },
      orderBy: { createdAt: 'asc' },
    });

    return memberships.map((m) => ({
      id: m.id,
      userId: m.user.id,
      email: m.user.email,
      name: m.user.name,
      role: m.role as UserRole,
      status: m.status as MembershipStatus,
      createdAt: m.createdAt.toISOString(),
    }));
  }

  async updateMemberRole(
    orgId: string,
    memberId: string,
    data: UpdateMemberRoleRequest,
    actorUserId: string,
  ): Promise<MemberResponse> {
    const membership = await prisma.membership.findUnique({
      where: { id: memberId },
      include: { user: true },
    });

    if (!membership || membership.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Member not found in this organization',
      });
    }

    // If demoting an OWNER, check if they are the only OWNER left
    if (membership.role === UserRole.OWNER && data.role !== UserRole.OWNER) {
      const ownerCount = await prisma.membership.count({
        where: {
          organizationId: orgId,
          role: UserRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (ownerCount <= 1) {
        throw new BadRequestException({
          code: ErrorCodes.BAD_REQUEST,
          message: 'Cannot demote the only organization Owner. Transfer ownership or promote another member first.',
        });
      }
    }

    const updated = await prisma.membership.update({
      where: { id: memberId },
      data: { role: data.role },
      include: { user: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'MEMBER_ROLE_UPDATE',
        entityType: 'Membership',
        entityId: memberId,
        metadataJson: { previousRole: membership.role, newRole: data.role, targetUserId: membership.userId },
      },
    });

    return {
      id: updated.id,
      userId: updated.user.id,
      email: updated.user.email,
      name: updated.user.name,
      role: updated.role as UserRole,
      status: updated.status as MembershipStatus,
      createdAt: updated.createdAt.toISOString(),
    };
  }

  async removeMember(
    orgId: string,
    memberId: string,
    actorUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const membership = await prisma.membership.findUnique({
      where: { id: memberId },
    });

    if (!membership || membership.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Member not found in this organization',
      });
    }

    // If removing an OWNER, ensure it is not the sole OWNER
    if (membership.role === UserRole.OWNER) {
      const ownerCount = await prisma.membership.count({
        where: {
          organizationId: orgId,
          role: UserRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      if (ownerCount <= 1) {
        throw new BadRequestException({
          code: ErrorCodes.BAD_REQUEST,
          message: 'Cannot remove the sole Owner from the organization.',
        });
      }
    }

    await prisma.membership.delete({
      where: { id: memberId },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'MEMBER_REMOVE',
        entityType: 'Membership',
        entityId: memberId,
        metadataJson: { removedUserId: membership.userId, role: membership.role },
      },
    });

    return { success: true, message: 'Member removed successfully' };
  }
}