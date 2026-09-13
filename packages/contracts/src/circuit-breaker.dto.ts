import { z } from 'zod';

export const CircuitBreakerStateEnum = z.enum(['CLOSED', 'OPEN', 'HALF_OPEN']);
export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateEnum>;

export const CircuitBreakerResponseSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  serviceId: z.string(),
  serviceSlug: z.string().optional(),
  serviceName: z.string().optional(),
  state: CircuitBreakerStateEnum,
  failureStrikes: z.number().int(),
  strikeWindowStart: z.string(),
  lastFailureAt: z.string().nullable(),
  lastExecutionAt: z.string().nullable(),
  trippedAt: z.string().nullable(),
  trippedReason: z.string().nullable(),
  cooldownEndsAt: z.string().nullable(),
  isInCooldown: z.boolean(),
  isActionAllowed: z.boolean(),
  lockActive: z.boolean(),
  lockExpiresAt: z.string().nullable().optional(),
});

export type CircuitBreakerResponse = z.infer<typeof CircuitBreakerResponseSchema>;

export const ResetCircuitBreakerRequestSchema = z.object({
  reason: z.string().min(5, 'Reason must be at least 5 characters').max(500),
});

export type ResetCircuitBreakerRequest = z.infer<typeof ResetCircuitBreakerRequestSchema>;

export const AutonomyGateCheckSchema = z.object({
  gateNumber: z.number().int().min(1).max(10),
  gateName: z.string(),
  passed: z.boolean(),
  reason: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export type AutonomyGateCheck = z.infer<typeof AutonomyGateCheckSchema>;

export const AutonomyEvaluationResultSchema = z.object({
  incidentId: z.string(),
  serviceId: z.string().nullable(),
  eligible: z.boolean(),
  actionType: z.string().optional(),
  actionParameters: z.record(z.unknown()).optional(),
  requiresApproval: z.boolean(),
  blockedReason: z.string().optional(),
  gateChecks: z.array(AutonomyGateCheckSchema),
});

export type AutonomyEvaluationResult = z.infer<typeof AutonomyEvaluationResultSchema>;

export const AutonomousTriggerResultSchema = z.object({
  incidentId: z.string(),
  triggered: z.boolean(),
  status: z.enum([
    'RESOLVED',
    'ROLLED_BACK',
    'PENDING_APPROVAL',
    'BLOCKED',
    'ESCALATED',
    'EXECUTING',
  ]),
  actionExecutionId: z.string().optional(),
  message: z.string(),
  evaluation: AutonomyEvaluationResultSchema,
  executionOutput: z.record(z.unknown()).optional().nullable(),
});

export type AutonomousTriggerResult = z.infer<typeof AutonomousTriggerResultSchema>;
