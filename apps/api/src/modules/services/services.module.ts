import { Module } from '@nestjs/common';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [ServicesController],
  providers: [ServicesService, TenantGuard, RolesGuard],
  exports: [ServicesService],
})
export class ServicesModule {}