import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  ActionExecutionResponse,
  AuthSessionUser,
  ExecuteActionRequest,
  ExecuteActionRequestSchema,
  OrganizationRemediationPolicyResponse,
  UpdateRemediationPolicyRequest,
  UpdateRemediationPolicyRequestSchema,
  UserRole,
} from '@sopon/contracts';
import { ActionsService } from './actions.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Controlled Remediation (ACT) Engine')
@Controller('v1/organizations/:orgId')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class ActionsController {
  constructor(private readonly actionsService: ActionsService) {}

  @Get('remediation-policy')
  @ApiOperation({ summary: 'Get organization autonomous remediation policy and kill-switch state' })
  async getPolicy(
    @Param('orgId') orgId: string,
  ): Promise<OrganizationRemediationPolicyResponse> {
    return this.actionsService.getOrCreatePolicy(orgId);
  }

  @Patch('remediation-policy')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update organization autonomous remediation policy or trigger kill-switch' })
  async updatePolicy(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(UpdateRemediationPolicyRequestSchema)) body: UpdateRemediationPolicyRequest,
  ): Promise<OrganizationRemediationPolicyResponse> {
    return this.actionsService.updatePolicy(orgId, body, user.id);
  }

  @Post('incidents/:incidentId/actions/dry-run')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER)
  @ApiOperation({ summary: 'Dry-run simulate a remediation action against safety gates and preconditions' })
  async dryRunAction(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(ExecuteActionRequestSchema)) body: ExecuteActionRequest,
  ): Promise<ActionExecutionResponse> {
    return this.actionsService.dryRunAction(orgId, incidentId, body, user.id);
  }

  @Post('incidents/:incidentId/actions/execute')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER)
  @ApiOperation({ summary: 'Execute a controlled remediation action with safety gates and closed-loop verification' })
  async executeAction(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(ExecuteActionRequestSchema)) body: ExecuteActionRequest,
  ): Promise<ActionExecutionResponse> {
    return this.actionsService.executeAction(orgId, incidentId, body, user.id);
  }

  @Post('incidents/:incidentId/actions/:actionId/approve')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Approve and dispatch a PENDING_APPROVAL remediation action' })
  async approveAction(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
    @Param('actionId') actionId: string,
    @CurrentUser() user: AuthSessionUser,
  ): Promise<ActionExecutionResponse> {
    return this.actionsService.approveAction(orgId, incidentId, actionId, user.id);
  }

  @Post('incidents/:incidentId/actions/:actionId/rollback')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  @ApiOperation({ summary: 'Trigger rollback for a previously executed remediation action' })
  async rollbackAction(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
    @Param('actionId') actionId: string,
    @CurrentUser() user: AuthSessionUser,
  ): Promise<ActionExecutionResponse> {
    return this.actionsService.rollbackAction(orgId, incidentId, actionId, user.id);
  }

  @Get('incidents/:incidentId/actions')
  @ApiOperation({ summary: 'List all action executions and verification trails for an incident' })
  async listActions(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<ActionExecutionResponse[]> {
    return this.actionsService.listIncidentActions(orgId, incidentId);
  }
}