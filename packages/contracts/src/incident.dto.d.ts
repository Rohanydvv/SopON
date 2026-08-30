import { z } from 'zod';
import { IncidentPriority, IncidentSeverity, IncidentStatus } from './enums';
export declare const CreateIncidentRequestSchema: z.ZodObject<{
    title: z.ZodString;
    description: z.ZodString;
    severity: z.ZodNativeEnum<typeof IncidentSeverity>;
    priority: z.ZodDefault<z.ZodOptional<z.ZodNativeEnum<typeof IncidentPriority>>>;
    serviceId: z.ZodOptional<z.ZodString>;
    teamId: z.ZodOptional<z.ZodString>;
    assigneeId: z.ZodOptional<z.ZodString>;
    source: z.ZodDefault<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    title: string;
    description: string;
    severity: IncidentSeverity;
    priority: IncidentPriority;
    source: string;
    serviceId?: string | undefined;
    teamId?: string | undefined;
    assigneeId?: string | undefined;
}, {
    title: string;
    description: string;
    severity: IncidentSeverity;
    priority?: IncidentPriority | undefined;
    serviceId?: string | undefined;
    teamId?: string | undefined;
    assigneeId?: string | undefined;
    source?: string | undefined;
}>;
export type CreateIncidentRequest = z.infer<typeof CreateIncidentRequestSchema>;
export declare const UpdateIncidentStatusRequestSchema: z.ZodObject<{
    status: z.ZodNativeEnum<typeof IncidentStatus>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: IncidentStatus;
    reason?: string | undefined;
}, {
    status: IncidentStatus;
    reason?: string | undefined;
}>;
export type UpdateIncidentStatusRequest = z.infer<typeof UpdateIncidentStatusRequestSchema>;
export declare const IngestEventRequestSchema: z.ZodObject<{
    service: z.ZodString;
    environment: z.ZodString;
    eventType: z.ZodString;
    title: z.ZodString;
    message: z.ZodString;
    severityHint: z.ZodOptional<z.ZodNativeEnum<typeof IncidentSeverity>>;
    externalEventId: z.ZodOptional<z.ZodString>;
    occurredAt: z.ZodOptional<z.ZodString>;
    metadata: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
}, "strip", z.ZodTypeAny, {
    message: string;
    title: string;
    service: string;
    environment: string;
    eventType: string;
    severityHint?: IncidentSeverity | undefined;
    externalEventId?: string | undefined;
    occurredAt?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}, {
    message: string;
    title: string;
    service: string;
    environment: string;
    eventType: string;
    severityHint?: IncidentSeverity | undefined;
    externalEventId?: string | undefined;
    occurredAt?: string | undefined;
    metadata?: Record<string, unknown> | undefined;
}>;
export type IngestEventRequest = z.infer<typeof IngestEventRequestSchema>;
//# sourceMappingURL=incident.dto.d.ts.map