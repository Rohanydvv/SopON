import { z } from 'zod';
import { IncidentPriority, IncidentSeverity, IncidentStatus } from './enums';

export const CreateIncidentRequestSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  description: z.string().min(5, 'Description must be at least 5 characters'),
  severity: z.nativeEnum(IncidentSeverity),
  priority: z.nativeEnum(IncidentPriority).optional().default(IncidentPriority.P3),
  serviceId: z.string().uuid('Invalid service ID').optional().or(z.literal('')),
  assigneeUserId: z.string().uuid('Invalid assignee ID').optional().or(z.literal('')),
});

export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequestSchema>;

export const UpdateIncidentRequestSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  description: z.string().min(5).optional(),
  status: z.nativeEnum(IncidentStatus).optional(),
  severity: z.nativeEnum(IncidentSeverity).optional(),
  priority: z.nativeEnum(IncidentPriority).optional(),
  serviceId: z.string().uuid().optional().nullable(),
  assigneeUserId: z.string().uuid().optional().nullable(),
});

export type UpdateIncidentRequest = z.infer<typeof UpdateIncidentRequestSchema>;

export const CreateTimelineEventRequestSchema = z.object({
  message: z.string().min(1, 'Message is required').max(2000),
  eventType: z.string().max(50).optional().default('NOTE_ADDED'),
  metadataJson: z.record(z.unknown()).optional(),
});

export type CreateTimelineEventRequest = z.infer<typeof CreateTimelineEventRequestSchema>;

export interface TimelineEventResponse {
  id: string;
  incidentId: string;
  actorUserId?: string | null;
  actorName?: string | null;
  eventType: string;
  message: string;
  metadataJson?: Record<string, unknown> | null;
  createdAt: string;
}

export interface IncidentResponse {
  id: string;
  organizationId: string;
  serviceId?: string | null;
  serviceName?: string | null;
  title: string;
  description: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  priority: IncidentPriority;
  source: string;
  assigneeUserId?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt?: string | null;
  resolvedAt?: string | null;
  closedAt?: string | null;
  timeline?: TimelineEventResponse[];
}