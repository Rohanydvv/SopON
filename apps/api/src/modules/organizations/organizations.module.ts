import { Module } from '@nestjs/common';
import { OrganizationsController } from './organizations.controller';
import { OrganizationsService } from './organizations.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [OrganizationsController],
  providers: [OrganizationsService, TenantGuard, RolesGuard],
  exports: [OrganizationsService],
})
export class OrganizationsModule {}