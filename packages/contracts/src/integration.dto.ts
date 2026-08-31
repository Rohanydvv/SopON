import { z } from 'zod';

export const IntegrationTypeSchema = z.enum([
  'PROMETHEUS',
  'DATADOG',
  'GRAFANA',
  'SENTRY',
  'GENERIC_WEBHOOK',
]);

export type IntegrationType = z.infer<typeof IntegrationTypeSchema>;

export const CreateIntegrationRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  type: IntegrationTypeSchema,
  configJson: z.record(z.unknown()).optional(),
});

export type CreateIntegrationRequest = z.infer<typeof CreateIntegrationRequestSchema>;

export interface IntegrationResponse {
  id: string;
  organizationId: string;
  type: string;
  name: string;
  key: string;
  isEnabled: boolean;
  configJson?: Record<string, unknown> | null;
  webhookUrl: string;
  createdAt: string;
}

export const WebhookAlertPayloadSchema = z.object({
  alertName: z.string().min(1, 'Alert name is required'),
  service: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  description: z.string().optional(),
  details: z.record(z.unknown()).optional(),
});

export type WebhookAlertPayload = z.infer<typeof WebhookAlertPayloadSchema>;