import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  CreateOrganizationRequest,
  ErrorCodes,
  MembershipStatus,
  OrganizationResponse,
  UpdateOrganizationRequest,
  UserRole,
} from '@sopon/contracts';

@Injectable()
export class OrganizationsService {
  async createOrganization(
    userId: string,
    data: CreateOrganizationRequest,
  ): Promise<OrganizationResponse> {
    const orgName = data.name.trim();
    const rawSlug = data.slug || this.generateSlug(orgName);

    let finalSlug = rawSlug;
    let counter = 1;
    while (await prisma.organization.findUnique({ where: { slug: finalSlug } })) {
      finalSlug = `${rawSlug}-${counter++}`;
    }

    const org = await prisma.$transaction(async (tx) => {
      const createdOrg = await tx.organization.create({
        data: {
          name: orgName,
          slug: finalSlug,
          plan: 'FREE',
        },
      });

      await tx.membership.create({
        data: {
          organizationId: createdOrg.id,
          userId,
          role: UserRole.OWNER,
          status: MembershipStatus.ACTIVE,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: createdOrg.id,
          actorUserId: userId,
          action: 'ORGANIZATION_CREATE',
          entityType: 'Organization',
          entityId: createdOrg.id,
          metadataJson: { name: createdOrg.name, slug: createdOrg.slug },
        },
      });

      return createdOrg;
    });

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      role: UserRole.OWNER,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async getOrganization(orgId: string, role: UserRole): Promise<OrganizationResponse> {
    const org = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!org) {
      throw new NotFoundException({
        code: ErrorCodes.ORGANIZATION_NOT_FOUND,
        message: 'Organization not found',
      });
    }

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      plan: org.plan,
      role,
      createdAt: org.createdAt.toISOString(),
    };
  }

  async updateOrganization(
    orgId: string,
    data: UpdateOrganizationRequest,
    actorUserId: string,
  ): Promise<OrganizationResponse> {
    const existing = await prisma.organization.findUnique({
      where: { id: orgId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ErrorCodes.ORGANIZATION_NOT_FOUND,
        message: 'Organization not found',
      });
    }

    const updated = await prisma.organization.update({
      where: { id: orgId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'ORGANIZATION_UPDATE',
        entityType: 'Organization',
        entityId: orgId,
        metadataJson: { updatedFields: data },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      plan: updated.plan,
      role: UserRole.ADMIN,
      createdAt: updated.createdAt.toISOString(),
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