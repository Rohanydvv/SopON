import { Module } from '@nestjs/common';
import { InvitationsController } from './invitations.controller';
import { InvitationsService } from './invitations.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [InvitationsController],
  providers: [InvitationsService, TenantGuard, RolesGuard],
  exports: [InvitationsService],
})
export class InvitationsModule {}