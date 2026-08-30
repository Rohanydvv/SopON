"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.IngestEventRequestSchema = exports.UpdateIncidentStatusRequestSchema = exports.CreateIncidentRequestSchema = void 0;
const zod_1 = require("zod");
const enums_1 = require("./enums");
exports.CreateIncidentRequestSchema = zod_1.z.object({
    title: zod_1.z.string().min(3).max(255),
    description: zod_1.z.string().min(5),
    severity: zod_1.z.nativeEnum(enums_1.IncidentSeverity),
    priority: zod_1.z.nativeEnum(enums_1.IncidentPriority).optional().default(enums_1.IncidentPriority.P3),
    serviceId: zod_1.z.string().uuid().optional(),
    teamId: zod_1.z.string().uuid().optional(),
    assigneeId: zod_1.z.string().uuid().optional(),
    source: zod_1.z.string().optional().default('MANUAL'),
});
exports.UpdateIncidentStatusRequestSchema = zod_1.z.object({
    status: zod_1.z.nativeEnum(enums_1.IncidentStatus),
    reason: zod_1.z.string().optional(),
});
exports.IngestEventRequestSchema = zod_1.z.object({
    service: zod_1.z.string().min(1),
    environment: zod_1.z.string().min(1),
    eventType: zod_1.z.string().min(1),
    title: zod_1.z.string().min(1),
    message: zod_1.z.string().min(1),
    severityHint: zod_1.z.nativeEnum(enums_1.IncidentSeverity).optional(),
    externalEventId: zod_1.z.string().optional(),
    occurredAt: zod_1.z.string().datetime().optional(),
    metadata: zod_1.z.record(zod_1.z.unknown()).optional(),
});
//# sourceMappingURL=incident.dto.js.map