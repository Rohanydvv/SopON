import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [MembersController],
  providers: [MembersService, TenantGuard, RolesGuard],
  exports: [MembersService],
})
export class MembersModule {}