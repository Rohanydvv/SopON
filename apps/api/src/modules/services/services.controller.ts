import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  AuthSessionUser,
  CreateServiceRequest,
  CreateServiceRequestSchema,
  ServiceResponse,
  UpdateServiceRequest,
  UpdateServiceRequestSchema,
  UserRole,
} from '@sopon/contracts';
import { ServicesService } from './services.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Services Catalog')
@Controller('v1/organizations/:orgId/services')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class ServicesController {
  constructor(private readonly servicesService: ServicesService) {}

  @Post()
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER)
  @ApiOperation({ summary: 'Register a new service in the catalog' })
  async createService(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(CreateServiceRequestSchema)) body: CreateServiceRequest,
  ): Promise<ServiceResponse> {
    return this.servicesService.createService(orgId, body, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'List all registered services' })
  async listServices(@Param('orgId') orgId: string): Promise<ServiceResponse[]> {
    return this.servicesService.listServices(orgId);
  }

  @Get(':serviceId')
  @ApiOperation({ summary: 'Get service details' })
  async getService(
    @Param('orgId') orgId: string,
    @Param('serviceId') serviceId: string,
  ): Promise<ServiceResponse> {
    return this.servicesService.getService(orgId, serviceId);
  }

  @Patch(':serviceId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER)
  @ApiOperation({ summary: 'Update service settings or status' })
  async updateService(
    @Param('orgId') orgId: string,
    @Param('serviceId') serviceId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(UpdateServiceRequestSchema)) body: UpdateServiceRequest,
  ): Promise<ServiceResponse> {
    return this.servicesService.updateService(orgId, serviceId, body, user.id);
  }

  @Delete(':serviceId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove a service from catalog' })
  async deleteService(
    @Param('orgId') orgId: string,
    @Param('serviceId') serviceId: string,
    @CurrentUser() user: AuthSessionUser,
  ) {
    return this.servicesService.deleteService(orgId, serviceId, user.id);
  }
}