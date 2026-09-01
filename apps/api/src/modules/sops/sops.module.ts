import { Module } from '@nestjs/common';
import { SopsController } from './sops.controller';
import { SopsService } from './sops.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [SopsController],
  providers: [SopsService, TenantGuard, RolesGuard],
  exports: [SopsService],
})
export class SopsModule {}