import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  AuthSessionUser,
  CreateIntegrationRequest,
  CreateIntegrationRequestSchema,
  IntegrationResponse,
  UserRole,
} from '@sopon/contracts';
import { IntegrationsService } from './integrations.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Integrations')
@Controller('v1/organizations/:orgId/integrations')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class IntegrationsController {
  constructor(private readonly integrationsService: IntegrationsService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Configure a new monitoring webhook integration' })
  async createIntegration(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(CreateIntegrationRequestSchema)) body: CreateIntegrationRequest,
  ): Promise<IntegrationResponse> {
    return this.integrationsService.createIntegration(orgId, body, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List configured integrations' })
  async listIntegrations(@Param('orgId') orgId: string): Promise<IntegrationResponse[]> {
    return this.integrationsService.listIntegrations(orgId);
  }

  @Delete(':integrationId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete an integration' })
  async deleteIntegration(
    @Param('orgId') orgId: string,
    @Param('integrationId') integrationId: string,
    @CurrentUser() user: AuthSessionUser,
  ) {
    return this.integrationsService.deleteIntegration(orgId, integrationId, user.id);
  }
}