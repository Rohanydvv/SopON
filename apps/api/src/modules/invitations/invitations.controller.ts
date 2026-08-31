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
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  AcceptInvitationRequest,
  AcceptInvitationRequestSchema,
  AuthSessionUser,
  CreateInvitationRequest,
  CreateInvitationRequestSchema,
  InvitationResponse,
  UserRole,
} from '@sopon/contracts';
import { InvitationsService } from './invitations.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Invitations')
@Controller('v1')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Post('organizations/:orgId/invitations')
  @UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Invite a member to the organization' })
  async createInvitation(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(CreateInvitationRequestSchema)) body: CreateInvitationRequest,
  ) {
    return this.invitationsService.createInvitation(orgId, body, user.id);
  }

  @Get('invitations/:token')
  @ApiOperation({ summary: 'Get invitation details by token' })
  async getInvitation(@Param('token') token: string): Promise<InvitationResponse> {
    return this.invitationsService.getInvitationByToken(token);
  }

  @Post('invitations/accept')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Accept an organization invitation' })
  async acceptInvitation(
    @Body(new ZodValidationPipe(AcceptInvitationRequestSchema)) body: AcceptInvitationRequest,
  ) {
    return this.invitationsService.acceptInvitation(body);
  }
}