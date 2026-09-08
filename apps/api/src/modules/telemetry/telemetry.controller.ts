import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import {
  ServiceTelemetryResponse,
  TelemetryQueryRequest,
  TelemetryQueryRequestSchema,
  UserRole,
} from '@sopon/contracts';
import { TelemetryService } from './telemetry.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@ApiTags('Telemetry & Observability')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('v1/organizations/:orgId/telemetry')
export class TelemetryController {
  constructor(private readonly telemetryService: TelemetryService) {}

  @Get('services/:serviceId')
  @Roles(UserRole.VIEWER)
  @ApiOperation({ summary: 'Get live service telemetry and metric anomalies' })
  async getServiceTelemetry(
    @Param('orgId') orgId: string,
    @Param('serviceId') serviceId: string,
    @Query('timeWindowMinutes') timeWindowMinutes?: string,
  ): Promise<ServiceTelemetryResponse> {
    const window = timeWindowMinutes ? parseInt(timeWindowMinutes, 10) : 15;
    return this.telemetryService.queryServiceTelemetry(orgId, {
      serviceId,
      timeWindowMinutes: isNaN(window) ? 15 : window,
    });
  }

  @Post('query')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.VIEWER)
  @ApiOperation({ summary: 'Query live service telemetry metrics by filters' })
  async queryTelemetry(
    @Param('orgId') orgId: string,
    @Body(new ZodValidationPipe(TelemetryQueryRequestSchema)) body: TelemetryQueryRequest,
  ): Promise<ServiceTelemetryResponse> {
    return this.telemetryService.queryServiceTelemetry(orgId, body);
  }
}
