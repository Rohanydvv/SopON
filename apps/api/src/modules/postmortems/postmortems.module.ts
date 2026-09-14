import { Module } from '@nestjs/common';
import { PostmortemsController } from './postmortems.controller';
import { PostmortemsService } from './postmortems.service';
import { PostmortemQualityGateService } from './postmortem-quality-gate.service';
import { PostmortemGeneratorService } from './postmortem-generator.service';
import { SopsModule } from '../sops/sops.module';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [SopsModule],
  controllers: [PostmortemsController],
  providers: [
    PostmortemsService,
    PostmortemQualityGateService,
    PostmortemGeneratorService,
    TenantGuard,
    RolesGuard,
  ],
  exports: [PostmortemsService, PostmortemQualityGateService],
})
export class PostmortemsModule {}
