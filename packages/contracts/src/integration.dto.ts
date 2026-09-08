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

// 1. Generic Webhook Payload
export const WebhookAlertPayloadSchema = z.object({
  alertName: z.string().min(1, 'Alert name is required'),
  service: z.string().optional(),
  status: z.string().optional(),
  severity: z.string().optional(),
  description: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  timestamp: z.union([z.number(), z.string()]).optional(),
  eventId: z.string().optional(),
});

export type WebhookAlertPayload = z.infer<typeof WebhookAlertPayloadSchema>;

// 2. Datadog Monitor Webhook Schema
export const DatadogWebhookPayloadSchema = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  event_title: z.string().optional(),
  title: z.string().optional(),
  body: z.string().optional(),
  text: z.string().optional(),
  message: z.string().optional(),
  alert_type: z.enum(['error', 'warning', 'info', 'success', 'custom']).optional(),
  priority: z.enum(['normal', 'low', 'urgent', 'all']).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
  date: z.union([z.number(), z.string()]).optional(),
  service: z.string().optional(),
  snapshot: z.string().optional(),
  link: z.string().optional(),
  hostname: z.string().optional(),
  org: z.record(z.unknown()).optional(),
});

export type DatadogWebhookPayload = z.infer<typeof DatadogWebhookPayloadSchema>;

// 3. Prometheus Alertmanager Webhook Schema
export const PrometheusAlertItemSchema = z.object({
  status: z.enum(['firing', 'resolved']),
  labels: z.record(z.string()),
  annotations: z.record(z.string()).optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  generatorURL: z.string().optional(),
  fingerprint: z.string().optional(),
});

export type PrometheusAlertItem = z.infer<typeof PrometheusAlertItemSchema>;

export const PrometheusAlertmanagerPayloadSchema = z.object({
  version: z.string().optional(),
  groupKey: z.string().optional(),
  truncatedAlerts: z.number().optional(),
  status: z.enum(['firing', 'resolved']),
  receiver: z.string().optional(),
  groupLabels: z.record(z.string()).optional(),
  commonLabels: z.record(z.string()).optional(),
  commonAnnotations: z.record(z.string()).optional(),
  externalURL: z.string().optional(),
  alerts: z.array(PrometheusAlertItemSchema).min(1, 'At least one alert is required in Prometheus payload'),
});

export type PrometheusAlertmanagerPayload = z.infer<typeof PrometheusAlertmanagerPayloadSchema>;

// 4. Sentry Webhook Schema
export const SentryWebhookPayloadSchema = z.object({
  id: z.string().optional(),
  action: z.enum(['created', 'triggered', 'resolved', 'updated', 'issue.created']).optional(),
  data: z.object({
    issue: z.object({
      id: z.string().optional(),
      title: z.string().min(1, 'Issue title is required'),
      culprit: z.string().optional(),
      level: z.string().optional(),
      status: z.string().optional(),
      platform: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
      project: z.record(z.unknown()).optional(),
      web_url: z.string().optional(),
    }).optional(),
    event: z.object({
      id: z.string().optional(),
      title: z.string().optional(),
      culprit: z.string().optional(),
      level: z.string().optional(),
      environment: z.string().optional(),
      timestamp: z.union([z.number(), z.string()]).optional(),
      tags: z.union([z.array(z.tuple([z.string(), z.string()])), z.record(z.string())]).optional(),
    }).optional(),
  }),
});

export type SentryWebhookPayload = z.infer<typeof SentryWebhookPayloadSchema>;

// Webhook Ingestion Result Contract
export interface WebhookIngestionResult {
  incidentId: string;
  action: 'CREATED' | 'DEDUPLICATED' | 'IGNORED';
  source: string;
  incidentTitle: string;
  severity: string;
  serviceId?: string | null;
  serviceName?: string | null;
  message: string;
}