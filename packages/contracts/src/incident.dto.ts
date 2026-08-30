import { z } from 'zod';
import { IncidentPriority, IncidentSeverity, IncidentStatus } from './enums';

export const CreateIncidentRequestSchema = z.object({
  title: z.string().min(3).max(255),
  description: z.string().min(5),
  severity: z.nativeEnum(IncidentSeverity),
  priority: z.nativeEnum(IncidentPriority).optional().default(IncidentPriority.P3),
  serviceId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  assigneeId: z.string().uuid().optional(),
  source: z.string().optional().default('MANUAL'),
});

export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequestSchema>;

export const UpdateIncidentStatusRequestSchema = z.object({
  status: z.nativeEnum(IncidentStatus),
  reason: z.string().optional(),
});

export type UpdateIncidentStatusRequest = z.infer<typeof UpdateIncidentStatusRequestSchema>;

export const IngestEventRequestSchema = z.object({
  service: z.string().min(1),
  environment: z.string().min(1),
  eventType: z.string().min(1),
  title: z.string().min(1),
  message: z.string().min(1),
  severityHint: z.nativeEnum(IncidentSeverity).optional(),
  externalEventId: z.string().optional(),
  occurredAt: z.string().datetime().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type IngestEventRequest = z.infer<typeof IngestEventRequestSchema>;
