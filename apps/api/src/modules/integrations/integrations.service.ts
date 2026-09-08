import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { prisma } from '@sopon/database';
import {
  CreateIntegrationRequest,
  DatadogWebhookPayload,
  ErrorCodes,
  IncidentPriority,
  IncidentSeverity,
  IncidentStatus,
  IntegrationResponse,
  PrometheusAlertmanagerPayload,
  SentryWebhookPayload,
  WebhookAlertPayload,
  WebhookIngestionResult,
} from '@sopon/contracts';

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

interface ReplayEntry {
  expiresAt: number;
}

@Injectable()
export class IntegrationsService {
  // In-memory sliding rate limiting & replay tracking
  private readonly rateLimits = new Map<string, RateLimitBucket>();
  private readonly replayStore = new Map<string, ReplayEntry>();

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

  /**
   * Universal Webhook Alert Ingestion (Backward-compatible & Generic)
   */
  async handleWebhookAlert(
    integrationKey: string,
    payload: WebhookAlertPayload,
    headers: Record<string, string | string[] | undefined> = {},
    rawBody = '',
  ): Promise<WebhookIngestionResult> {
    const integration = await this.validateAndAuthenticateWebhook(
      integrationKey,
      payload,
      headers,
      rawBody,
      payload.timestamp,
      payload.eventId,
    );

    return this.processStandardAlert(
      integration,
      payload.alertName,
      payload.description || `Automated alert triggered from integration: ${integration.name}`,
      payload.severity,
      payload.service,
      payload.details || {},
      `INTEGRATION_${integration.type}`,
    );
  }

  /**
   * Datadog Monitor Webhook Ingestion
   */
  async handleDatadogWebhook(
    integrationKey: string,
    payload: DatadogWebhookPayload,
    headers: Record<string, string | string[] | undefined> = {},
    rawBody = '',
  ): Promise<WebhookIngestionResult> {
    const eventId = payload.id ? String(payload.id) : undefined;
    const timestamp = payload.date ? (typeof payload.date === 'number' ? payload.date * 1000 : payload.date) : undefined;

    const integration = await this.validateAndAuthenticateWebhook(
      integrationKey,
      payload,
      headers,
      rawBody,
      timestamp,
      eventId,
    );

    const title = payload.event_title || payload.title || payload.message || 'Datadog Monitor Alert';
    const description = payload.body || payload.text || payload.message || 'Datadog monitor alert triggered';

    // Map Datadog alert_type / priority
    let severity = 'HIGH';
    if (payload.alert_type === 'error' || payload.priority === 'urgent') {
      severity = 'CRITICAL';
    } else if (payload.alert_type === 'warning' || payload.priority === 'normal') {
      severity = 'HIGH';
    } else if (payload.alert_type === 'info' || payload.priority === 'low') {
      severity = 'MEDIUM';
    }

    // Extract service from tags if not provided directly
    let serviceName = payload.service;
    if (!serviceName && payload.tags) {
      const tagList = Array.isArray(payload.tags) ? payload.tags : [payload.tags];
      const serviceTag = tagList.find((t) => t.startsWith('service:'));
      if (serviceTag) {
        serviceName = serviceTag.replace('service:', '').trim();
      }
    }

    const details = {
      datadogId: payload.id,
      snapshot: payload.snapshot,
      link: payload.link,
      hostname: payload.hostname,
      tags: payload.tags,
    };

    return this.processStandardAlert(
      integration,
      title,
      description,
      severity,
      serviceName,
      details,
      'INTEGRATION_DATADOG',
    );
  }

  /**
   * Prometheus Alertmanager Webhook Ingestion
   */
  async handlePrometheusWebhook(
    integrationKey: string,
    payload: PrometheusAlertmanagerPayload,
    headers: Record<string, string | string[] | undefined> = {},
    rawBody = '',
  ): Promise<WebhookIngestionResult> {
    const primaryAlert = payload.alerts[0];
    const timestamp = primaryAlert?.startsAt;
    const eventId = primaryAlert?.fingerprint || payload.groupKey;

    const integration = await this.validateAndAuthenticateWebhook(
      integrationKey,
      payload,
      headers,
      rawBody,
      timestamp,
      eventId,
    );

    // If status is resolved, handle deduplicated resolution
    if (payload.status === 'resolved') {
      const title = primaryAlert?.labels?.alertname || payload.commonLabels?.alertname || 'Prometheus Alert';
      const existing = await prisma.incident.findFirst({
        where: {
          organizationId: integration.organizationId,
          title: { contains: title },
          status: { in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING] },
        },
      });

      if (existing) {
        await prisma.incidentTimeline.create({
          data: {
            incidentId: existing.id,
            eventType: 'ALERT_RESOLVED',
            message: `Prometheus Alertmanager reported alert resolved: ${title}`,
            metadataJson: payload as any,
          },
        });
        return {
          incidentId: existing.id,
          action: 'DEDUPLICATED',
          source: 'INTEGRATION_PROMETHEUS',
          incidentTitle: existing.title,
          severity: existing.severity,
          serviceId: existing.serviceId,
          message: 'Resolved notification received and attached to timeline',
        };
      }
    }

    // Process firing alerts
    const title = primaryAlert?.labels?.alertname || payload.commonLabels?.alertname || 'Prometheus Alert';
    const description = primaryAlert?.annotations?.description
      || primaryAlert?.annotations?.summary
      || payload.commonAnnotations?.description
      || 'Prometheus Alertmanager alert firing';

    const severity = primaryAlert?.labels?.severity || payload.commonLabels?.severity || 'HIGH';
    const serviceName = primaryAlert?.labels?.service || payload.commonLabels?.service || primaryAlert?.labels?.job;

    const details = {
      receiver: payload.receiver,
      groupKey: payload.groupKey,
      commonLabels: payload.commonLabels,
      commonAnnotations: payload.commonAnnotations,
      externalURL: payload.externalURL,
      alertCount: payload.alerts.length,
      generatorURL: primaryAlert?.generatorURL,
    };

    return this.processStandardAlert(
      integration,
      title,
      description,
      severity,
      serviceName,
      details,
      'INTEGRATION_PROMETHEUS',
    );
  }

  /**
   * Sentry Issue Webhook Ingestion
   */
  async handleSentryWebhook(
    integrationKey: string,
    payload: SentryWebhookPayload,
    headers: Record<string, string | string[] | undefined> = {},
    rawBody = '',
  ): Promise<WebhookIngestionResult> {
    const issue = payload.data?.issue;
    const event = payload.data?.event;
    const eventId = issue?.id || event?.id || payload.id;
    const timestamp = event?.timestamp;

    const integration = await this.validateAndAuthenticateWebhook(
      integrationKey,
      payload,
      headers,
      rawBody,
      timestamp,
      eventId,
    );

    const title = issue?.title || event?.title || 'Sentry Issue Detected';
    const description = issue?.culprit || event?.culprit || (issue?.metadata?.value as string) || 'Unhandled exception in Sentry';

    let severity = 'HIGH';
    const level = (issue?.level || event?.level || '').toLowerCase();
    if (level === 'fatal' || level === 'error') {
      severity = 'CRITICAL';
    } else if (level === 'warning') {
      severity = 'HIGH';
    } else if (level === 'info') {
      severity = 'MEDIUM';
    }

    const serviceName = (issue?.project?.name as string) || event?.environment || issue?.platform;

    const details = {
      sentryIssueId: issue?.id,
      culprit: issue?.culprit || event?.culprit,
      platform: issue?.platform,
      webUrl: issue?.web_url,
      action: payload.action,
    };

    return this.processStandardAlert(
      integration,
      title,
      description,
      severity,
      serviceName,
      details,
      'INTEGRATION_SENTRY',
    );
  }

  // ---------------------------------------------------------------------------
  // Core Security & Ingestion Pipeline
  // ---------------------------------------------------------------------------

  private async validateAndAuthenticateWebhook(
    integrationKey: string,
    payload: any,
    headers: Record<string, string | string[] | undefined>,
    rawBody: string,
    alertTimestamp?: string | number,
    eventId?: string,
  ) {
    const integration = await prisma.integration.findUnique({
      where: { key: integrationKey },
    });

    if (!integration || !integration.isEnabled) {
      await this.recordAuditLog(
        null,
        'WEBHOOK_REJECTED',
        'Integration',
        integrationKey,
        { reason: 'Invalid or disabled integration key' },
      );
      throw new UnauthorizedException({
        code: ErrorCodes.UNAUTHORIZED,
        message: 'Invalid or disabled integration key',
      });
    }

    const orgId = integration.organizationId;

    // 1. Rate Limiting: Max 60 webhook alerts per minute per integration key
    this.enforceRateLimit(integration.id, 60, 60000);

    // 2. HMAC Signature Verification (if signature header provided)
    const signatureHeader = this.getHeader(headers, [
      'x-sopon-signature',
      'x-hub-signature-256',
      'x-datadog-signature',
      'x-sentry-signature',
    ]);

    const secretTokenHeader = this.getHeader(headers, ['x-sopon-secret', 'authorization']);

    if (signatureHeader) {
      const cleanSignature = signatureHeader.replace(/^sha256=/, '').trim();
      const payloadToVerify = rawBody || JSON.stringify(payload);
      const computedSignature = crypto
        .createHmac('sha256', integration.secret)
        .update(payloadToVerify)
        .digest('hex');

      const sigBuffer = Buffer.from(cleanSignature, 'hex');
      const compBuffer = Buffer.from(computedSignature, 'hex');

      if (sigBuffer.length !== compBuffer.length || !crypto.timingSafeEqual(sigBuffer, compBuffer)) {
        await this.recordAuditLog(
          orgId,
          'WEBHOOK_REJECTED',
          'Integration',
          integration.id,
          { reason: 'HMAC signature verification failed', signatureProvided: cleanSignature },
        );
        throw new UnauthorizedException({
          code: 'INVALID_SIGNATURE',
          message: 'HMAC signature verification failed',
        });
      }
    } else if (secretTokenHeader) {
      const token = secretTokenHeader.replace(/^Bearer\s+/i, '').trim();
      if (token !== integration.secret && token !== integration.key) {
        await this.recordAuditLog(
          orgId,
          'WEBHOOK_REJECTED',
          'Integration',
          integration.id,
          { reason: 'Secret token mismatch' },
        );
        throw new UnauthorizedException({
          code: 'INVALID_SECRET_TOKEN',
          message: 'Secret token verification failed',
        });
      }
    }

    // 3. Timestamp & Replay Protection: Reject alerts > 300s old or in future > 60s
    const tsHeader = this.getHeader(headers, ['x-sopon-timestamp']);
    const rawTs = tsHeader || alertTimestamp;
    if (rawTs) {
      const parsedTime = typeof rawTs === 'number'
        ? (rawTs < 10000000000 ? rawTs * 1000 : rawTs)
        : new Date(rawTs).getTime();

      if (!isNaN(parsedTime)) {
        const now = Date.now();
        const diffSec = (now - parsedTime) / 1000;
        if (diffSec > 300 || diffSec < -60) {
          await this.recordAuditLog(
            orgId,
            'WEBHOOK_REJECTED',
            'Integration',
            integration.id,
            { reason: 'Timestamp outside 300-second window', timestamp: parsedTime, diffSec },
          );
          throw new BadRequestException({
            code: 'TIMESTAMP_EXPIRED_OR_DRIFT',
            message: `Alert timestamp is outside the allowed 300-second window (drift: ${Math.round(diffSec)}s)`,
          });
        }
      }
    }

    // 4. Nonce / Event ID Replay Deduplication
    const nonce = this.getHeader(headers, ['x-sopon-nonce', 'x-sopon-event-id']) || eventId;
    if (nonce) {
      const replayKey = `${integration.id}:${nonce}`;
      const existingReplay = this.replayStore.get(replayKey);
      if (existingReplay && existingReplay.expiresAt > Date.now()) {
        await this.recordAuditLog(
          orgId,
          'WEBHOOK_REJECTED',
          'Integration',
          integration.id,
          { reason: 'Replay detected for event ID', eventId: nonce },
        );
        throw new ConflictException({
          code: 'REPLAY_DETECTED',
          message: `Replay attempt detected for event ID: ${nonce}`,
        });
      }
      this.replayStore.set(replayKey, { expiresAt: Date.now() + 300000 });
    }

    return integration;
  }

  private async processStandardAlert(
    integration: any,
    title: string,
    description: string,
    rawSeverity?: string,
    rawServiceName?: string,
    details: Record<string, unknown> = {},
    source = 'INTEGRATION',
  ): Promise<WebhookIngestionResult> {
    const orgId = integration.organizationId;

    // Resolve service scoped strictly to organization
    let serviceId: string | null = null;
    let serviceName: string | null = null;

    if (rawServiceName) {
      const matchedService = await prisma.service.findFirst({
        where: {
          organizationId: orgId,
          OR: [
            { name: { equals: rawServiceName, mode: 'insensitive' } },
            { slug: { equals: rawServiceName.toLowerCase().trim() } },
          ],
        },
      });
      if (matchedService) {
        serviceId = matchedService.id;
        serviceName = matchedService.name;
      }
    }

    const severity = this.mapSeverity(rawSeverity);

    // Deduplication check: Is there an existing open or investigating incident for this alert?
    const existingIncident = await prisma.incident.findFirst({
      where: {
        organizationId: orgId,
        title,
        status: { in: [IncidentStatus.OPEN, IncidentStatus.INVESTIGATING] },
      },
    });

    if (existingIncident) {
      await prisma.incidentTimeline.create({
        data: {
          incidentId: existingIncident.id,
          eventType: 'ALERT_DEDUPLICATED',
          message: `Repeat alert received from ${integration.name}: ${description}`,
          metadataJson: details as any,
        },
      });

      await this.recordAuditLog(
        orgId,
        'WEBHOOK_ALERT_INGESTED',
        'Incident',
        existingIncident.id,
        { action: 'DEDUPLICATED', integrationId: integration.id, source },
      );

      return {
        incidentId: existingIncident.id,
        action: 'DEDUPLICATED',
        source,
        incidentTitle: existingIncident.title,
        severity: existingIncident.severity,
        serviceId: existingIncident.serviceId,
        serviceName,
        message: 'Alert deduplicated into existing active incident timeline',
      };
    }

    // Create new incident
    const newIncident = await prisma.incident.create({
      data: {
        organizationId: orgId,
        serviceId,
        title,
        description,
        status: IncidentStatus.OPEN,
        severity,
        priority: severity === IncidentSeverity.CRITICAL ? IncidentPriority.P1 : IncidentPriority.P2,
        source,
        metadataJson: details as any,
      },
    });

    // Create timeline event
    await prisma.incidentTimeline.create({
      data: {
        incidentId: newIncident.id,
        eventType: 'ALERT_INGESTED',
        message: `Incident opened automatically by inbound webhook: ${integration.name}`,
        metadataJson: { integrationType: integration.type, source, details } as any,
      },
    });

    await this.recordAuditLog(
      orgId,
      'WEBHOOK_ALERT_INGESTED',
      'Incident',
      newIncident.id,
      { action: 'CREATED', integrationId: integration.id, source, title },
    );

    return {
      incidentId: newIncident.id,
      action: 'CREATED',
      source,
      incidentTitle: newIncident.title,
      severity: newIncident.severity,
      serviceId: newIncident.serviceId,
      serviceName,
      message: 'New incident opened successfully from inbound webhook',
    };
  }

  private enforceRateLimit(key: string, maxRequests: number, windowMs: number) {
    const now = Date.now();
    const bucket = this.rateLimits.get(key);

    if (!bucket || bucket.resetAt < now) {
      this.rateLimits.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    if (bucket.count >= maxRequests) {
      throw new HttpException(
        {
          code: 'RATE_LIMIT_EXCEEDED',
          message: `Webhook rate limit exceeded. Max ${maxRequests} requests per ${windowMs / 1000}s.`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    bucket.count += 1;
  }

  private getHeader(
    headers: Record<string, string | string[] | undefined>,
    names: string[],
  ): string | undefined {
    for (const name of names) {
      const val = headers[name.toLowerCase()] || headers[name];
      if (val) {
        return Array.isArray(val) ? val[0] : val;
      }
    }
    return undefined;
  }

  private async recordAuditLog(
    orgId: string | null,
    action: string,
    entityType: string,
    entityId: string,
    metadataJson: Record<string, unknown>,
  ) {
    if (!orgId) return;
    try {
      await prisma.auditLog.create({
        data: {
          organizationId: orgId,
          action,
          entityType,
          entityId,
          metadataJson: metadataJson as any,
        },
      });
    } catch {
      // Non-blocking audit failure
    }
  }

  private mapSeverity(raw?: string): IncidentSeverity {
    if (!raw) return IncidentSeverity.HIGH;
    const upper = raw.toUpperCase();
    if (upper.includes('CRIT') || upper.includes('P1') || upper.includes('FATAL') || upper.includes('URGENT')) {
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