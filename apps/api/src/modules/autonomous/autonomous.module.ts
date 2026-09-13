import { Module } from '@nestjs/common';
import { AutonomousPipelineService } from './autonomous-pipeline.service';
import { AutonomousReconciliationService } from './autonomous-reconciliation.service';
import { AutonomousController } from './autonomous.controller';
import { CopilotModule } from '../copilot/copilot.module';
import { ActionsModule } from '../actions/actions.module';
import { CircuitBreakerModule } from '../circuit-breaker/circuit-breaker.module';
import { VaultModule } from '../vault/vault.module';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  imports: [CopilotModule, ActionsModule, CircuitBreakerModule, VaultModule],
  controllers: [AutonomousController],
  providers: [
    AutonomousPipelineService,
    AutonomousReconciliationService,
    TenantGuard,
    RolesGuard,
  ],
  exports: [AutonomousPipelineService, AutonomousReconciliationService],
})
export class AutonomousModule {}
