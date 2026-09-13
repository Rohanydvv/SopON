import {
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
  AutonomyEvaluationResult,
  AutonomousTriggerResult,
} from '@sopon/contracts';
import { AutonomousPipelineService } from './autonomous-pipeline.service';
import { AutonomousReconciliationService, ReconciliationReport } from './autonomous-reconciliation.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Autonomous Trigger Pipeline')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('v1/organizations/:organizationId')
export class AutonomousController {
  constructor(
    private readonly autonomousPipelineService: AutonomousPipelineService,
    private readonly reconciliationService: AutonomousReconciliationService,
  ) {}

  @Get('incidents/:incidentId/autonomous/evaluate')
  @ApiOperation({ summary: 'Evaluate the 10-Point Autonomy Authority Matrix for an incident' })
  async evaluateIncident(
    @Param('organizationId') orgId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<AutonomyEvaluationResult> {
    return this.autonomousPipelineService.evaluateAutonomyMatrix(orgId, incidentId);
  }

  @Post('incidents/:incidentId/autonomous/trigger')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute the full autonomous remediation pipeline on an incident' })
  async triggerAutonomousPipeline(
    @Param('organizationId') orgId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: any,
  ): Promise<AutonomousTriggerResult> {
    return this.autonomousPipelineService.processIncident(orgId, incidentId, user.id);
  }

  @Post('autonomous/reconcile')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reconcile orphaned executions and clear expired distributed locks' })
  async reconcileExecutions(
    @Param('organizationId') orgId: string,
  ): Promise<ReconciliationReport> {
    return this.reconciliationService.reconcileOrphanedExecutions(orgId);
  }
}
