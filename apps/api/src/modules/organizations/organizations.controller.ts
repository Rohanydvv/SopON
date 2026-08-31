import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  AuthSessionUser,
  CreateOrganizationRequest,
  CreateOrganizationRequestSchema,
  OrganizationResponse,
  UpdateOrganizationRequest,
  UpdateOrganizationRequestSchema,
  UserRole,
} from '@sopon/contracts';
import { OrganizationsService } from './organizations.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CurrentTenant, ActiveTenantContext } from '../../common/decorators/current-tenant.decorator';

@ApiTags('Organizations')
@Controller('v1/organizations')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class OrganizationsController {
  constructor(private readonly organizationsService: OrganizationsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new organization' })
  async createOrganization(
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(CreateOrganizationRequestSchema)) body: CreateOrganizationRequest,
  ): Promise<OrganizationResponse> {
    return this.organizationsService.createOrganization(user.id, body);
  }

  @Get(':orgId')
  @UseGuards(TenantGuard)
  @ApiOperation({ summary: 'Get organization details' })
  async getOrganization(
    @Param('orgId') orgId: string,
    @CurrentTenant() tenant: ActiveTenantContext,
  ): Promise<OrganizationResponse> {
    return this.organizationsService.getOrganization(orgId, tenant.role);
  }

  @Patch(':orgId')
  @UseGuards(TenantGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update organization settings' })
  async updateOrganization(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(UpdateOrganizationRequestSchema)) body: UpdateOrganizationRequest,
  ): Promise<OrganizationResponse> {
    return this.organizationsService.updateOrganization(orgId, body, user.id);
  }
}