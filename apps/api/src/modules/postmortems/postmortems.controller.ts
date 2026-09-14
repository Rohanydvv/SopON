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
import {
  AuthSessionUser,
  DeprecatePostmortemRequest,
  DeprecatePostmortemRequestSchema,
  GeneratePostmortemRequest,
  GeneratePostmortemRequestSchema,
  PostmortemListQuery,
  PostmortemListQuerySchema,
  PostmortemResponse,
  ReviewPostmortemRequest,
  ReviewPostmortemRequestSchema,
  UserRole,
} from '@sopon/contracts';
import { PostmortemsService } from './postmortems.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@Controller('v1/organizations/:organizationId')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class PostmortemsController {
  constructor(private readonly postmortemsService: PostmortemsService) {}

  /**
   * Generates or regenerates a postmortem from a resolved incident
   */
  @Post('incidents/:incidentId/postmortem/generate')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER)
  async generatePostmortem(
    @Param('organizationId') orgId: string,
    @Param('incidentId') incidentId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(GeneratePostmortemRequestSchema)) body: GeneratePostmortemRequest,
  ): Promise<PostmortemResponse> {
    return this.postmortemsService.generatePostmortem(
      orgId,
      incidentId,
      user?.id,
      body?.customNotes,
    );
  }

  /**
   * Gets postmortem for an incident
   */
  @Get('incidents/:incidentId/postmortem')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER, UserRole.VIEWER)
  async getPostmortemByIncident(
    @Param('organizationId') orgId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<PostmortemResponse> {
    return this.postmortemsService.getPostmortemByIncidentId(orgId, incidentId);
  }

  /**
   * Gets postmortem by ID
   */
  @Get('postmortems/:postmortemId')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER, UserRole.VIEWER)
  async getPostmortemById(
    @Param('organizationId') orgId: string,
    @Param('postmortemId') postmortemId: string,
  ): Promise<PostmortemResponse> {
    return this.postmortemsService.getPostmortemById(orgId, postmortemId);
  }

  /**
   * Lists postmortems for organization
   */
  @Get('postmortems')
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER, UserRole.VIEWER)
  async listPostmortems(
    @Param('organizationId') orgId: string,
    @Query(new ZodValidationPipe(PostmortemListQuerySchema)) query: PostmortemListQuery,
  ): Promise<PostmortemResponse[]> {
    return this.postmortemsService.listPostmortems(orgId, query);
  }

  /**
   * Reviews and approves / rejects a postmortem
   */
  @Post('postmortems/:postmortemId/review')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  async reviewPostmortem(
    @Param('organizationId') orgId: string,
    @Param('postmortemId') postmortemId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(ReviewPostmortemRequestSchema)) body: ReviewPostmortemRequest,
  ): Promise<PostmortemResponse> {
    return this.postmortemsService.reviewPostmortem(orgId, postmortemId, user?.id, body);
  }

  /**
   * Manually deprecates a postmortem and its linked knowledge document
   */
  @Post('postmortems/:postmortemId/deprecate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER)
  async deprecatePostmortem(
    @Param('organizationId') orgId: string,
    @Param('postmortemId') postmortemId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(DeprecatePostmortemRequestSchema)) body: DeprecatePostmortemRequest,
  ): Promise<PostmortemResponse> {
    return this.postmortemsService.deprecatePostmortem(
      orgId,
      postmortemId,
      user?.id,
      body.reason,
    );
  }
}
