import { z } from 'zod';

export const ActionRiskTierSchema = z.enum([
  'SAFE_AUTOMATIC',
  'REQUIRES_APPROVAL',
  'MANUAL_ESCALATION',
]);

export type ActionRiskTier = z.infer<typeof ActionRiskTierSchema>;

export const ActionTypeSchema = z.enum([
  'RESTART_SERVICE_WORKER',
  'SCALE_SERVICE_REPLICAS',
  'UPDATE_POOL_CONFIG',
  'CLEAR_SERVICE_CACHE',
  'TRIGGER_ROLLBACK',
  'HTTP_WEBHOOK_REMEDIATION',
]);

export type ActionType = z.infer<typeof ActionTypeSchema>;

export const ActionExecutionStatusSchema = z.enum([
  'PENDING_APPROVAL',
  'QUEUED',
  'RUNNING',
  'VERIFYING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
  'CANCELLED',
  'ROLLED_BACK',
]);

export type ActionExecutionStatus = z.infer<typeof ActionExecutionStatusSchema>;

export const RestartServiceParamsSchema = z.object({
  serviceId: z.string().uuid().optional(),
  serviceSlug: z.string().min(2).max(64).optional(),
  namespace: z.string().min(2).max(64).optional(),
  clusterName: z.string().min(2).max(64).optional(),
  gracePeriodSeconds: z.number().int().min(5).max(120).optional().default(30),
  gracefulTimeoutSeconds: z.number().int().min(5).max(120).optional(),
  drainConnections: z.boolean().optional().default(true),
  reason: z.string().min(3).max(255).optional(),
});

export type RestartServiceParams = z.infer<typeof RestartServiceParamsSchema>;

export const ScaleServiceParamsSchema = z.object({
  serviceId: z.string().uuid().optional(),
  serviceSlug: z.string().min(2).max(64).optional(),
  namespace: z.string().min(2).max(64).optional(),
  clusterName: z.string().min(2).max(64).optional(),
  targetReplicas: z.number().int().min(1).max(50),
  currentReplicas: z.number().int().min(1).max(50).optional(),
  minReplicas: z.number().int().min(1).max(50).optional(),
  maxReplicas: z.number().int().min(1).max(50).optional(),
  reason: z.string().min(3).max(255).optional(),
});

export type ScaleServiceParams = z.infer<typeof ScaleServiceParamsSchema>;

export const UpdatePoolConfigParamsSchema = z.object({
  serviceId: z.string().uuid().optional(),
  poolSize: z.number().int().min(1).max(1000).optional(),
  maxConnections: z.number().int().min(1).max(1000).optional(),
  timeoutMs: z.number().int().min(100).max(60000).optional(),
  connectionTimeoutMs: z.number().int().min(100).max(60000).optional(),
  idleTimeoutMs: z.number().int().min(100).max(300000).optional(),
  reason: z.string().min(3).max(255).optional(),
});

export type UpdatePoolConfigParams = z.infer<typeof UpdatePoolConfigParamsSchema>;

export const ClearCacheParamsSchema = z.object({
  serviceId: z.string().uuid().optional(),
  keyPrefix: z.string().min(1).max(128).optional(),
  reason: z.string().min(3).max(255).optional(),
});

export type ClearCacheParams = z.infer<typeof ClearCacheParamsSchema>;

export const TriggerRollbackParamsSchema = z.object({
  serviceId: z.string().uuid().optional(),
  targetReleaseHash: z.string().min(6).max(64).optional(),
  reason: z.string().min(3).max(255).optional(),
});

export type TriggerRollbackParams = z.infer<typeof TriggerRollbackParamsSchema>;

export const WebhookRemediationParamsSchema = z.object({
  serviceId: z.string().uuid().optional(),
  webhookUrl: z.string().url(),
  payloadJson: z.record(z.unknown()).optional(),
  reason: z.string().min(3).max(255).optional(),
});

export type WebhookRemediationParams = z.infer<typeof WebhookRemediationParamsSchema>;

// Execute and Dry Run Request DTO
export const ExecuteActionRequestSchema = z.object({
  actionType: ActionTypeSchema,
  parameters: z.record(z.unknown()),
  targetServiceId: z.string().uuid().optional(),
});

export type ExecuteActionRequest = z.infer<typeof ExecuteActionRequestSchema>;

export interface ActionExecutionResponse {
  id: string;
  organizationId: string;
  incidentId: string;
  actionType: ActionType;
  riskTier: ActionRiskTier;
  status: ActionExecutionStatus;
  isDryRun: boolean;
  targetServiceId?: string | null;
  targetServiceName?: string | null;
  parameters: Record<string, unknown>;
  executionOutput?: Record<string, unknown> | null;
  errorMessage?: string | null;
  preconditionChecks: Array<{ check: string; passed: boolean }>;
  verificationResults?: Array<{ probe: string; passed: boolean; message: string }> | null;
  startedAt?: string | null;
  completedAt?: string | null;
  verifiedAt?: string | null;
  rollbackStatus?: string | null;
  actorUserId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export const UpdateRemediationPolicyRequestSchema = z.object({
  autonomousRemediationEnabled: z.boolean().optional(),
  maxConcurrentActions: z.number().int().min(1).max(10).optional(),
  cooldownPeriodMinutes: z.number().int().min(1).max(60).optional(),
  allowedActionTypes: z.array(ActionTypeSchema).optional(),
  requireApprovalForProduction: z.boolean().optional(),
});

export type UpdateRemediationPolicyRequest = z.infer<typeof UpdateRemediationPolicyRequestSchema>;

export interface OrganizationRemediationPolicyResponse {
  id: string;
  organizationId: string;
  autonomousRemediationEnabled: boolean;
  maxConcurrentActions: number;
  cooldownPeriodMinutes: number;
  allowedActionTypes: ActionType[];
  requireApprovalForProduction: boolean;
  createdAt: string;
  updatedAt: string;
}