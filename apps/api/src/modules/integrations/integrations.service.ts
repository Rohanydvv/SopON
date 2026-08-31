import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { prisma } from '@sopon/database';
import {
  CreateIntegrationRequest,
  ErrorCodes,
  IncidentPriority,
  IncidentSeverity,
  IncidentStatus,
  IntegrationResponse,
  WebhookAlertPayload,
} from '@sopon/contracts';

@Injectable()
export class IntegrationsService {
  async createIntegration(
    orgId: string,
    data: CreateIntegrationRequest,
    actorUserId: string,
  ): Promise<IntegrationResponse> {
    const rawKey = `sopon_int_${crypto.randomBytes(16).toString('hex')}`;
    const secret = crypto.randomBytes(32).toString('hex');

    const integration = await prisma.integration.create({
      data: {
        organizationId: orgId,
        type: data.type,
        name: data.name.trim(),
        key: rawKey,
        secret,
        configJson: (data.configJson || {}) as any,
        isEnabled: true,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'INTEGRATION_CREATE',
        entityType: 'Integration',
        entityId: integration.id,
        metadataJson: { name: integration.name, type: integration.type },
      },
    });

    return this.mapToResponse(integration);
  }

  async listIntegrations(orgId: string): Promise<IntegrationResponse[]> {
    const integrations = await prisma.integration.findMany({
      where: { organizationId: orgId },
      orderBy: { createdAt: 'desc' },
    });

    return integrations.map((i) => this.mapToResponse(i));
  }

  async deleteIntegration(
    orgId: string,
    integrationId: string,
    actorUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await prisma.integration.findUnique({
      where: { id: integrationId },
    });

    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Integration not found',
      });
    }

    await prisma.integration.delete({
      where: { id: integrationId },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'INTEGRATION_DELETE',
        entityType: 'Integration',
        entityId: integrationId,
      },
    });

    return { success: true, message: 'Integration deleted successfully' };
  }

  async handleWebhookAlert(
    integrationKey: string,
    payload: WebhookAlertPayload,
  ): Promise<{ incidentId: string; action: 'CREATED' | 'DEDUPLICATED' }> {
    const integration = await prisma.integration.findUnique({
      where: { key: integrationKey },
    });

    if (!integration || !integration.isEnabled) {
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Invalid or disabled integration key',
      });
    }

    const orgId = integration.organizationId;

    // Resolve service if provided
    let serviceId: string | null = null;
    if (payload.service) {
      const matchedService = await prisma.service.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            { name: { equals: payload.service, mode: 'insensitive' } },
            { slug: { equals: payload.service.toLowerCase().trim() } },
          ],
        },
      });
      if (matchedService) {
        serviceId = matchedService.id;
      }
    }

    const title = payload.alertName;
    const severity = this.mapSeverity(payload.severity);

    // Check for open deduplicatable incident
    const existingIncident = await prisma.incident.findFirst({
      where: {
        organizationId: orgId,
        title,
        status: { in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING] },
      },
    });

    if (existingIncident) {
      // Append deduplicated alert event to timeline
      await prisma.incidentTimeline.create({
        data: {
          incidentId: existingIncident.id,
          eventType: 'ALERT_DEDUPLICATED',
          message: `Repeat alert received from ${integration.name}: ${payload.description || 'No additional details'}`,
          metadataJson: (payload.details || {}) as any,
        },
      });

      return { incidentId: existingIncident.id, action: 'DEDUPLICATED' };
    }

    // Create fresh incident
    const newIncident = await prisma.incident.create({
      data: {
        organizationId: orgId,
        serviceId,
        title,
        description: payload.description || `Automated alert triggered from integration: ${integration.name}`,
        status: IncidentStatus.OPEN,
        severity,
        priority: severity === IncidentSeverity.CRITICAL ? IncidentPriority.P1 : IncidentPriority.P2,
        source: `INTEGRATION_${integration.type}`,
        metadataJson: (payload.details || {}) as any,
      },
    });

    // Create initial timeline event
    await prisma.incidentTimeline.create({
      data: {
        incidentId: newIncident.id,
        eventType: 'ALERT_INGESTED',
        message: `Incident opened automatically by inbound webhook: ${integration.name}`,
        metadataJson: { integrationType: integration.type, payload } as any,
      },
    });

    return { incidentId: newIncident.id, action: 'CREATED' };
  }

  private mapSeverity(raw?: string): IncidentSeverity {
    if (!raw) return IncidentSeverity.HIGH;
    const upper = raw.toUpperCase();
    if (upper.includes('CRIT') || upper.includes('P1') || upper.includes('FATAL')) {
      return IncidentSeverity.CRITICAL;
    }
    if (upper.includes('HIGH') || upper.includes('WARN') || upper.includes('P2')) {
      return IncidentSeverity.HIGH;
    }
    if (upper.includes('MED') || upper.includes('P3')) {
      return IncidentSeverity.MEDIUM;
    }
    return IncidentSeverity.LOW;
  }

  private mapToResponse(i: {
    id: string;
    organizationId: string;
    type: string;
    name: string;
    key: string;
    isEnabled: boolean;
    configJson: any;
    createdAt: Date;
  }): IntegrationResponse {
    return {
      id: i.id,
      organizationId: i.organizationId,
      type: i.type,
      name: i.name,
      key: i.key,
      isEnabled: i.isEnabled,
      configJson: i.configJson,
      webhookUrl: `/api/v1/webhooks/alerts/${i.key}`,
      createdAt: i.createdAt.toISOString(),
    };
  }
}