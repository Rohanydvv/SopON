import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { WebhooksController } from './webhooks.controller';
import { IntegrationsService } from './integrations.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [IntegrationsController, WebhooksController],
  providers: [IntegrationsService, TenantGuard, RolesGuard],
  exports: [IntegrationsService],
})
export class IntegrationsModule {}