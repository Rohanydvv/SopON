import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { WebhookAlertPayload, WebhookAlertPayloadSchema } from '@sopon/contracts';
import { IntegrationsService } from './integrations.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@ApiTags('Inbound Webhooks')
@Controller('v1/webhooks')
export class WebhooksController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post('alerts/:integrationKey')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Ingest monitoring alert and trigger or deduplicate incident' })
  async ingestAlert(
    @Param('integrationKey') integrationKey: string,
    @Body(new ZodValidationPipe(WebhookAlertPayloadSchema)) body: WebhookAlertPayload,
  ) {
    return this.integrationsService.handleWebhookAlert(integrationKey, body);
  }
}