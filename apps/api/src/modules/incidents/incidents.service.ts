import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  CreateIncidentRequest,
  CreateTimelineEventRequest,
  ErrorCodes,
  IncidentPriority,
  IncidentResponse,
  IncidentSeverity,
  IncidentStatus,
  TimelineEventResponse,
  UpdateIncidentRequest,
} from '@sopon/contracts';

@Injectable()
export class IncidentsService {
  async createIncident(
    orgId: string,
    data: CreateIncidentRequest,
    actorUserId: string,
    actorName?: string,
  ): Promise<IncidentResponse> {
    // Validate service if provided
    if (data.serviceId) {
      const service = await prisma.service.findUnique({
        where: { id: data.serviceId },
      });
      if (!service || service.organizationId !== orgId) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Specified service does not belong to this organization',
        });
      }
    }

    const incident = await prisma.$transaction(async (tx) => {
      const created = await tx.incident.create({
        data: {
          organizationId: orgId,
          serviceId: data.serviceId || null,
          title: data.title.trim(),
          description: data.description.trim(),
          severity: data.severity,
          priority: data.priority || IncidentPriority.P3,
          status: IncidentStatus.OPEN,
          source: 'MANUAL',
          assigneeId: data.assigneeUserId || null,
        },
        include: {
          service: true,
          assigneeUser: true,
        },
      });

      // Append initial timeline event
      await tx.incidentTimeline.create({
        data: {
          incidentId: created.id,
          actorUserId,
          eventType: 'INCIDENT_CREATED',
          message: `Incident declared by ${actorName || 'User'} with severity ${data.severity}`,
          metadataJson: { severity: data.severity, priority: created.priority },
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorUserId,
          action: 'INCIDENT_CREATE',
          entityType: 'Incident',
          entityId: created.id,
          metadataJson: { title: created.title, severity: created.severity },
        },
      });

      return created;
    });

    return this.mapToResponse(incident);
  }

  async listIncidents(
    orgId: string,
    filters: {
      status?: IncidentStatus;
      severity?: IncidentSeverity;
      serviceId?: string;
      search?: string;
    } = {},
  ): Promise<IncidentResponse[]> {
    const where: any = {
      organizationId: orgId,
    };

    if (filters.status) {
      where.status = filters.status;
    }

    if (filters.severity) {
      where.severity = filters.severity;
    }

    if (filters.serviceId) {
      where.serviceId = filters.serviceId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { description: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const incidents = await prisma.incident.findMany({
      where,
      include: {
        service: true,
        assigneeUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return incidents.map((i) => this.mapToResponse(i));
  }

  async getIncident(orgId: string, incidentId: string): Promise<IncidentResponse> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: {
        service: true,
        assigneeUser: true,
        timeline: {
          include: { actorUser: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!incident || incident.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.INCIDENT_NOT_FOUND,
        message: 'Incident not found in this organization',
      });
    }

    return this.mapToResponse(incident, incident.timeline);
  }

  async updateIncident(
    orgId: string,
    incidentId: string,
    data: UpdateIncidentRequest,
    actorUserId: string,
    actorName?: string,
  ): Promise<IncidentResponse> {
    const existing = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.INCIDENT_NOT_FOUND,
        message: 'Incident not found in this organization',
      });
    }

    const updateData: any = {};
    const timelineEvents: { eventType: string; message: string; metadataJson?: any }[] = [];

    if (data.title && data.title !== existing.title) {
      updateData.title = data.title.trim();
    }

    if (data.description && data.description !== existing.description) {
      updateData.description = data.description.trim();
    }

    if (data.severity && data.severity !== existing.severity) {
      updateData.severity = data.severity;
      timelineEvents.push({
        eventType: 'SEVERITY_CHANGED',
        message: `Severity changed from ${existing.severity} to ${data.severity} by ${actorName || 'User'}`,
        metadataJson: { previousSeverity: existing.severity, newSeverity: data.severity },
      });
    }

    if (data.priority && data.priority !== existing.priority) {
      updateData.priority = data.priority;
    }

    if (data.status && data.status !== existing.status) {
      updateData.status = data.status;

      if (data.status === IncidentStatus.ACKNOWLEDGED && !existing.acknowledgedAt) {
        updateData.acknowledgedAt = new Date();
      } else if (data.status === IncidentStatus.RESOLVED && !existing.resolvedAt) {
        updateData.resolvedAt = new Date();
      } else if (data.status === IncidentStatus.CLOSED && !existing.closedAt) {
        updateData.closedAt = new Date();
      }

      timelineEvents.push({
        eventType: 'STATUS_CHANGED',
        message: `Status updated from ${existing.status} to ${data.status} by ${actorName || 'User'}`,
        metadataJson: { previousStatus: existing.status, newStatus: data.status },
      });
    }

    if (data.assigneeUserId !== undefined && data.assigneeUserId !== existing.assigneeId) {
      updateData.assigneeId = data.assigneeUserId || null;
      timelineEvents.push({
        eventType: 'ASSIGNEE_CHANGED',
        message: `Assignee updated by ${actorName || 'User'}`,
        metadataJson: { assigneeUserId: data.assigneeUserId },
      });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const inc = await tx.incident.update({
        where: { id: incidentId },
        data: updateData,
        include: {
          service: true,
          assigneeUser: true,
        },
      });

      for (const event of timelineEvents) {
        await tx.incidentTimeline.create({
          data: {
            incidentId,
            actorUserId,
            eventType: event.eventType,
            message: event.message,
            metadataJson: event.metadataJson || {},
          },
        });
      }

      await tx.auditLog.create({
        data: {
          organizationId: orgId,
          actorUserId,
          action: 'INCIDENT_UPDATE',
          entityType: 'Incident',
          entityId: incidentId,
          metadataJson: { updatedFields: data },
        },
      });

      return inc;
    });

    return this.mapToResponse(updated);
  }

  async addTimelineEvent(
    orgId: string,
    incidentId: string,
    data: CreateTimelineEventRequest,
    actorUserId: string,
    actorName?: string,
  ): Promise<TimelineEventResponse> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident || incident.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.INCIDENT_NOT_FOUND,
        message: 'Incident not found in this organization',
      });
    }

    const timeline = await prisma.incidentTimeline.create({
      data: {
        incidentId,
        actorUserId,
        eventType: data.eventType || 'NOTE_ADDED',
        message: data.message.trim(),
        metadataJson: (data.metadataJson || {}) as any,
      },
      include: {
        actorUser: true,
      },
    });

    return {
      id: timeline.id,
      incidentId: timeline.incidentId,
      actorUserId: timeline.actorUserId,
      actorName: timeline.actorUser?.name || actorName || null,
      eventType: timeline.eventType,
      message: timeline.message,
      metadataJson: timeline.metadataJson as Record<string, unknown> | null,
      createdAt: timeline.createdAt.toISOString(),
    };
  }

  async listTimelineEvents(orgId: string, incidentId: string): Promise<TimelineEventResponse[]> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident || incident.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.INCIDENT_NOT_FOUND,
        message: 'Incident not found in this organization',
      });
    }

    const events = await prisma.incidentTimeline.findMany({
      where: { incidentId },
      include: { actorUser: true },
      orderBy: { createdAt: 'asc' },
    });

    return events.map((e) => ({
      id: e.id,
      incidentId: e.incidentId,
      actorUserId: e.actorUserId,
      actorName: e.actorUser?.name || null,
      eventType: e.eventType,
      message: e.message,
      metadataJson: e.metadataJson as Record<string, unknown> | null,
      createdAt: e.createdAt.toISOString(),
    }));
  }

  private mapToResponse(
    i: any,
    timelineList?: any[],
  ): IncidentResponse {
    return {
      id: i.id,
      organizationId: i.organizationId,
      serviceId: i.serviceId,
      serviceName: i.service?.name || null,
      title: i.title,
      description: i.description,
      status: i.status as IncidentStatus,
      severity: i.severity as IncidentSeverity,
      priority: i.priority as IncidentPriority,
      source: i.source,
      assigneeUserId: i.assigneeId,
      assigneeName: i.assigneeUser?.name || null,
      assigneeEmail: i.assigneeUser?.email || null,
      createdAt: i.createdAt.toISOString(),
      updatedAt: i.updatedAt.toISOString(),
      acknowledgedAt: i.acknowledgedAt?.toISOString() || null,
      resolvedAt: i.resolvedAt?.toISOString() || null,
      closedAt: i.closedAt?.toISOString() || null,
      timeline: timelineList?.map((e) => ({
        id: e.id,
        incidentId: e.incidentId,
        actorUserId: e.actorUserId,
        actorName: e.actorUser?.name || null,
        eventType: e.eventType,
        message: e.message,
        metadataJson: e.metadataJson,
        createdAt: e.createdAt.toISOString(),
      })),
    };
  }
}