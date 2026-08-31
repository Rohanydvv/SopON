import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  AuthSessionUser,
  CreateIncidentRequest,
  CreateIncidentRequestSchema,
  CreateTimelineEventRequest,
  CreateTimelineEventRequestSchema,
  IncidentResponse,
  IncidentSeverity,
  IncidentStatus,
  TimelineEventResponse,
  UpdateIncidentRequest,
  UpdateIncidentRequestSchema,
} from '@sopon/contracts';
import { IncidentsService } from './incidents.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Incidents')
@Controller('v1/organizations/:orgId/incidents')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class IncidentsController {
  constructor(private readonly incidentsService: IncidentsService) {}

  @Post()
  @ApiOperation({ summary: 'Declare a new incident' })
  async createIncident(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(CreateIncidentRequestSchema)) body: CreateIncidentRequest,
  ): Promise<IncidentResponse> {
    return this.incidentsService.createIncident(orgId, body, user.id, user.name);
  }

  @Get()
  @ApiOperation({ summary: 'List and filter organization incidents' })
  @ApiQuery({ name: 'status', required: false, enum: IncidentStatus })
  @ApiQuery({ name: 'severity', required: false, enum: IncidentSeverity })
  @ApiQuery({ name: 'serviceId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  async listIncidents(
    @Param('orgId') orgId: string,
    @Query('status') status?: IncidentStatus,
    @Query('severity') severity?: IncidentSeverity,
    @Query('serviceId') serviceId?: string,
    @Query('search') search?: string,
  ): Promise<IncidentResponse[]> {
    return this.incidentsService.listIncidents(orgId, {
      status,
      severity,
      serviceId,
      search,
    });
  }

  @Get(':incidentId')
  @ApiOperation({ summary: 'Get full incident details with timeline' })
  async getIncident(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<IncidentResponse> {
    return this.incidentsService.getIncident(orgId, incidentId);
  }

  @Patch(':incidentId')
  @ApiOperation({ summary: 'Update incident status, severity, or assignee' })
  async updateIncident(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(UpdateIncidentRequestSchema)) body: UpdateIncidentRequest,
  ): Promise<IncidentResponse> {
    return this.incidentsService.updateIncident(orgId, incidentId, body, user.id, user.name);
  }

  @Post(':incidentId/timeline')
  @ApiOperation({ summary: 'Add a manual responder note to incident timeline' })
  async addTimelineEvent(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(CreateTimelineEventRequestSchema)) body: CreateTimelineEventRequest,
  ): Promise<TimelineEventResponse> {
    return this.incidentsService.addTimelineEvent(orgId, incidentId, body, user.id, user.name);
  }

  @Get(':incidentId/timeline')
  @ApiOperation({ summary: 'Get chronological activity timeline for incident' })
  async listTimelineEvents(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<TimelineEventResponse[]> {
    return this.incidentsService.listTimelineEvents(orgId, incidentId);
  }
}