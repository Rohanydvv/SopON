import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  CreateServiceRequest,
  ErrorCodes,
  ServiceEnvironment,
  ServiceResponse,
  ServiceStatus,
  UpdateServiceRequest,
} from '@sopon/contracts';

@Injectable()
export class ServicesService {
  async createService(
    orgId: string,
    data: CreateServiceRequest,
    actorUserId: string,
  ): Promise<ServiceResponse> {
    const rawSlug = data.slug || this.generateSlug(data.name);

    // Check slug uniqueness within organization
    let finalSlug = rawSlug;
    let counter = 1;
    while (
      await prisma.service.findUnique({
        where: {
          organizationId_slug: {
            organizationId: orgId,
            slug: finalSlug,
          },
        },
      })
    ) {
      finalSlug = `${rawSlug}-${counter++}`;
    }

    const service = await prisma.service.create({
      data: {
        organizationId: orgId,
        name: data.name.trim(),
        slug: finalSlug,
        description: data.description?.trim() || null,
        tier: data.tier || 'Tier 2',
        environment: data.environment || ServiceEnvironment.PRODUCTION,
        status: ServiceStatus.OPERATIONAL,
        repositoryUrl: data.repositoryUrl || null,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'SERVICE_CREATE',
        entityType: 'Service',
        entityId: service.id,
        metadataJson: { name: service.name, slug: service.slug },
      },
    });

    return this.mapToResponse(service);
  }

  async listServices(orgId: string): Promise<ServiceResponse[]> {
    const services = await prisma.service.findMany({
      where: { organizationId: orgId },
      orderBy: { name: 'asc' },
    });

    return services.map((s) => this.mapToResponse(s));
  }

  async getService(orgId: string, serviceId: string): Promise<ServiceResponse> {
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!service || service.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.SERVICE_NOT_FOUND,
        message: 'Service not found in this organization',
      });
    }

    return this.mapToResponse(service);
  }

  async updateService(
    orgId: string,
    serviceId: string,
    data: UpdateServiceRequest,
    actorUserId: string,
  ): Promise<ServiceResponse> {
    const existing = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.SERVICE_NOT_FOUND,
        message: 'Service not found in this organization',
      });
    }

    const updated = await prisma.service.update({
      where: { id: serviceId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.tier ? { tier: data.tier } : {}),
        ...(data.environment ? { environment: data.environment } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.repositoryUrl !== undefined ? { repositoryUrl: data.repositoryUrl || null } : {}),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'SERVICE_UPDATE',
        entityType: 'Service',
        entityId: serviceId,
        metadataJson: { updatedFields: data },
      },
    });

    return this.mapToResponse(updated);
  }

  async deleteService(
    orgId: string,
    serviceId: string,
    actorUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await prisma.service.findUnique({
      where: { id: serviceId },
    });

    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.SERVICE_NOT_FOUND,
        message: 'Service not found in this organization',
      });
    }

    await prisma.service.delete({
      where: { id: serviceId },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'SERVICE_DELETE',
        entityType: 'Service',
        entityId: serviceId,
      },
    });

    return { success: true, message: 'Service deleted successfully' };
  }

  private mapToResponse(s: {
    id: string;
    organizationId: string;
    name: string;
    slug: string;
    description?: string | null;
    tier?: string;
    environment: string;
    status: string;
    repositoryUrl?: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): ServiceResponse {
    return {
      id: s.id,
      organizationId: s.organizationId,
      name: s.name,
      slug: s.slug,
      description: s.description || null,
      tier: s.tier || 'Tier 2',
      environment: s.environment as ServiceEnvironment,
      status: s.status as ServiceStatus,
      repositoryUrl: s.repositoryUrl || null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    };
  }

  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return base || 'service';
  }
}