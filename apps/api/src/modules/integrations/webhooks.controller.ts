import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  DatadogWebhookPayload,
  DatadogWebhookPayloadSchema,
  PrometheusAlertmanagerPayload,
  PrometheusAlertmanagerPayloadSchema,
  SentryWebhookPayload,
  SentryWebhookPayloadSchema,
  WebhookAlertPayload,
  WebhookAlertPayloadSchema,
  WebhookIngestionResult,
} from '@sopon/contracts';
import { IntegrationsService } from './integrations.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@ApiTags('Inbound Webhooks')
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post('alerts/:integrationKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest generic monitoring alert and trigger/deduplicate incident' })
  async ingestGenericAlert(
    @Param('integrationKey') integrationKey: string,
    @Body(new ZodValidationPipe(WebhookAlertPayloadSchema)) body: WebhookAlertPayload,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: any,
  ): Promise<WebhookIngestionResult> {
    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : (req.body ? JSON.stringify(req.body) : '');
    return this.integrationsService.handleWebhookAlert(integrationKey, body, headers, rawBody);
  }

  @Post('datadog/:integrationKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest Datadog monitor webhook alert' })
  async ingestDatadogAlert(
    @Param('integrationKey') integrationKey: string,
    @Body(new ZodValidationPipe(DatadogWebhookPayloadSchema)) body: DatadogWebhookPayload,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: any,
  ): Promise<WebhookIngestionResult> {
    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : (req.body ? JSON.stringify(req.body) : '');
    return this.integrationsService.handleDatadogWebhook(integrationKey, body, headers, rawBody);
  }

  @Post('prometheus/:integrationKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest Prometheus Alertmanager webhook payload' })
  async ingestPrometheusAlert(
    @Param('integrationKey') integrationKey: string,
    @Body(new ZodValidationPipe(PrometheusAlertmanagerPayloadSchema)) body: PrometheusAlertmanagerPayload,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: any,
  ): Promise<WebhookIngestionResult> {
    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : (req.body ? JSON.stringify(req.body) : '');
    return this.integrationsService.handlePrometheusWebhook(integrationKey, body, headers, rawBody);
  }

  @Post('sentry/:integrationKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest Sentry issue/exception webhook payload' })
  async ingestSentryAlert(
    @Param('integrationKey') integrationKey: string,
    @Body(new ZodValidationPipe(SentryWebhookPayloadSchema)) body: SentryWebhookPayload,
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Req() req: any,
  ): Promise<WebhookIngestionResult> {
    const rawBody = typeof req.rawBody === 'string' ? req.rawBody : (req.body ? JSON.stringify(req.body) : '');
    return this.integrationsService.handleSentryWebhook(integrationKey, body, headers, rawBody);
  }
}