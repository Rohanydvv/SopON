import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import {
  AuthSessionUser,
  MemberResponse,
  UpdateMemberRoleRequest,
  UpdateMemberRoleRequestSchema,
  UserRole,
} from '@sopon/contracts';
import { MembersService } from './members.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('Organization Members')
@Controller('v1/organizations/:orgId/members')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @ApiOperation({ summary: 'List all members in the organization' })
  async listMembers(@Param('orgId') orgId: string): Promise<MemberResponse[]> {
    return this.membersService.listMembers(orgId);
  }

  @Patch(':memberId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Update a member role' })
  async updateMemberRole(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(UpdateMemberRoleRequestSchema)) body: UpdateMemberRoleRequest,
  ): Promise<MemberResponse> {
    return this.membersService.updateMemberRole(orgId, memberId, body, user.id);
  }

  @Delete(':memberId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Remove a member from the organization' })
  async removeMember(
    @Param('orgId') orgId: string,
    @Param('memberId') memberId: string,
    @CurrentUser() user: AuthSessionUser,
  ) {
    return this.membersService.removeMember(orgId, memberId, user.id);
  }
}