import { Module } from '@nestjs/common';
import { IncidentsController } from './incidents.controller';
import { IncidentsService } from './incidents.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [IncidentsController],
  providers: [IncidentsService, TenantGuard, RolesGuard],
  exports: [IncidentsService],
})
export class IncidentsModule {}