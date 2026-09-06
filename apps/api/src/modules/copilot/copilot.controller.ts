import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  AuthSessionUser,
  IncidentAnalysisResponse,
  UserRole,
} from '@sopon/contracts';
import { CopilotService } from './copilot.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Autonomous Copilot & RCA Engine')
@Controller('v1/organizations/:orgId/incidents/:incidentId')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Post('analyze')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER)
  @ApiOperation({ summary: 'Trigger autonomous multi-stage incident investigation, RCA, and remediation planning' })
  async analyzeIncident(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthSessionUser,
  ): Promise<IncidentAnalysisResponse> {
    return this.copilotService.analyzeIncident(orgId, incidentId, user.id);
  }

  @Get('analysis')
  @ApiOperation({ summary: 'Get the latest autonomous RCA and remediation plan for an incident' })
  async getIncidentAnalysis(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<IncidentAnalysisResponse> {
    return this.copilotService.getIncidentAnalysis(orgId, incidentId);
  }
}