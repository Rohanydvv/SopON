import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  AuthSessionUser,
  CreateVaultCredentialRequest,
  CreateVaultCredentialRequestSchema,
  DecryptedVaultCredentialResponse,
  RotateVaultCredentialRequest,
  RotateVaultCredentialRequestSchema,
  UpdateVaultCredentialRequest,
  UpdateVaultCredentialRequestSchema,
  UserRole,
  VaultCredentialMetadataResponse,
} from '@sopon/contracts';
import { VaultService } from './vault.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';

@ApiTags('KMS Credential Vault')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
@Controller('v1/organizations/:orgId/vault')
export class VaultController {
  constructor(private readonly vaultService: VaultService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Store encrypted infrastructure credential via KMS Envelope Encryption' })
  async createCredential(
    @Param('orgId') orgId: string,
    @Body(new ZodValidationPipe(CreateVaultCredentialRequestSchema)) body: CreateVaultCredentialRequest,
    @CurrentUser() user: AuthSessionUser,
  ): Promise<VaultCredentialMetadataResponse> {
    return this.vaultService.createCredential(orgId, body, user.id);
  }

  @Get()
  @Roles(UserRole.VIEWER, UserRole.ENGINEER, UserRole.MANAGER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'List credential metadata for organization (Secrets strictly redacted)' })
  async listCredentials(
    @Param('orgId') orgId: string,
  ): Promise<VaultCredentialMetadataResponse[]> {
    return this.vaultService.listCredentials(orgId);
  }

  @Get(':credentialId')
  @Roles(UserRole.VIEWER, UserRole.ENGINEER, UserRole.MANAGER, UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Get credential metadata by ID (Secrets strictly redacted)' })
  async getCredentialMetadata(
    @Param('orgId') orgId: string,
    @Param('credentialId') credentialId: string,
  ): Promise<VaultCredentialMetadataResponse> {
    return this.vaultService.getCredentialMetadata(orgId, credentialId);
  }

  @Post(':credentialId/decrypt')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Authorized Decryption of credential payload (Audited)' })
  async decryptCredential(
    @Param('orgId') orgId: string,
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: AuthSessionUser,
  ): Promise<DecryptedVaultCredentialResponse> {
    return this.vaultService.decryptCredentialById(orgId, credentialId, user.id);
  }

  @Patch(':credentialId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Update credential metadata or secret payload' })
  async updateCredential(
    @Param('orgId') orgId: string,
    @Param('credentialId') credentialId: string,
    @Body(new ZodValidationPipe(UpdateVaultCredentialRequestSchema)) body: UpdateVaultCredentialRequest,
    @CurrentUser() user: AuthSessionUser,
  ): Promise<VaultCredentialMetadataResponse> {
    return this.vaultService.updateCredential(orgId, credentialId, body, user.id);
  }

  @Post(':credentialId/rotate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Rotate credential secret payload' })
  async rotateCredentialSecret(
    @Param('orgId') orgId: string,
    @Param('credentialId') credentialId: string,
    @Body(new ZodValidationPipe(RotateVaultCredentialRequestSchema)) body: RotateVaultCredentialRequest,
    @CurrentUser() user: AuthSessionUser,
  ): Promise<VaultCredentialMetadataResponse> {
    return this.vaultService.rotateCredentialSecret(orgId, credentialId, body, user.id);
  }

  @Post('master-key/rotate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.OWNER)
  @ApiOperation({ summary: 'Rotate KMS Master Key and re-encrypt all stored DEKs' })
  async rotateMasterKey(
    @CurrentUser() user: AuthSessionUser,
  ): Promise<{ credentialsUpdated: number; newKeyVersion: number }> {
    return this.vaultService.rotateMasterKeyAndReEncryptDeks(user.id);
  }

  @Delete(':credentialId')
  @Roles(UserRole.ADMIN, UserRole.OWNER)
  @ApiOperation({ summary: 'Delete and revoke vault credential' })
  async deleteCredential(
    @Param('orgId') orgId: string,
    @Param('credentialId') credentialId: string,
    @CurrentUser() user: AuthSessionUser,
  ): Promise<{ success: boolean; message: string }> {
    return this.vaultService.deleteCredential(orgId, credentialId, user.id);
  }
}
