import { Module } from '@nestjs/common';
import { CircuitBreakerService } from './circuit-breaker.service';
import { CircuitBreakerController } from './circuit-breaker.controller';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';

@Module({
  controllers: [CircuitBreakerController],
  providers: [CircuitBreakerService, TenantGuard, RolesGuard],
  exports: [CircuitBreakerService],
})
export class CircuitBreakerModule {}
