import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  CircuitBreakerResponse,
  ResetCircuitBreakerRequest,
  ResetCircuitBreakerRequestSchema,
} from '@sopon/contracts';
import { CircuitBreakerService } from './circuit-breaker.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@ApiTags('Service Circuit Breakers & Cooldowns')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('v1/organizations/:organizationId/services/:serviceId/circuit-breaker')
export class CircuitBreakerController {
  constructor(private readonly circuitBreakerService: CircuitBreakerService) {}

  @Get()
  @ApiOperation({ summary: 'Get persistent circuit breaker, cooldown, and lock state for a service' })
  async getCircuitBreaker(
    @Param('organizationId') orgId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<CircuitBreakerResponse> {
    const cb = await this.circuitBreakerService.getOrCreate(orgId, serviceId);
    return this.circuitBreakerService.mapToResponse(cb);
  }

  @Post('reset')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually reset an OPEN circuit breaker to CLOSED (OWNER/ADMIN only)' })
  async resetCircuitBreaker(
    @Param('organizationId') orgId: string,
    @Param('serviceId') serviceId: string,
    @Body(new ZodValidationPipe(ResetCircuitBreakerRequestSchema)) body: ResetCircuitBreakerRequest,
    @CurrentUser() user: any,
  ): Promise<CircuitBreakerResponse> {
    return this.circuitBreakerService.manualReset(orgId, serviceId, user.id, body.reason);
  }
}
