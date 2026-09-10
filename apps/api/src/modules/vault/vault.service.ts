import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { prisma } from '@sopon/database';
import {
  CreateVaultCredentialRequest,
  DecryptedVaultCredentialResponse,
  ErrorCodes,
  RotateVaultCredentialRequest,
  UpdateVaultCredentialRequest,
  VaultCredentialMetadataResponse,
} from '@sopon/contracts';
import { KmsProvider } from './kms-provider.interface';

@Injectable()
export class VaultService {
  constructor(
    @Inject('KmsProvider')
    private readonly kmsProvider: KmsProvider,
  ) {}

  /**
   * Encrypts and stores an infrastructure credential using Envelope Encryption (KMS Master Key -> DEK -> Secret)
   */
  async createCredential(
    orgId: string,
    data: CreateVaultCredentialRequest,
    actorUserId?: string,
  ): Promise<VaultCredentialMetadataResponse> {
    // Validate target service if provided
    let service = null;
    if (data.serviceId) {
      service = await prisma.service.findFirst({
        where: { id: data.serviceId, organizationId: orgId },
      });
      if (!service) {
        throw new BadRequestException({
          code: ErrorCodes.SERVICE_NOT_FOUND,
          message: 'Specified service not found in this organization',
        });
      }
    }

    const { encryptedDek, encryptedData, ivHex, authTagHex, keyVersion, keyFingerprint } =
      await this.encryptSecretPayload(data.secretPayload);

    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    const credential = await prisma.vaultCredential.create({
      data: {
        organizationId: orgId,
        serviceId: service?.id || null,
        name: data.name.trim(),
        targetType: data.targetType,
        environment: data.environment,
        encryptedDek,
        encryptedData,
        ivHex,
        authTagHex,
        keyVersion,
        keyFingerprint,
        metadataJson: (data.metadataJson || {}) as any,
        lastRotatedAt: new Date(),
      },
      include: { service: true },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: validActorId,
        action: 'VAULT_CREDENTIAL_STORED',
        entityType: 'VaultCredential',
        entityId: credential.id,
        metadataJson: {
          name: credential.name,
          targetType: credential.targetType,
          environment: credential.environment,
          keyFingerprint: credential.keyFingerprint,
          keyVersion: credential.keyVersion,
        },
      },
    });

    return this.mapToMetadataResponse(credential);
  }

  /**
   * Lists credential metadata for an organization. Secrets are strictly omitted/redacted.
   */
  async listCredentials(orgId: string): Promise<VaultCredentialMetadataResponse[]> {
    const credentials = await prisma.vaultCredential.findMany({
      where: { organizationId: orgId },
      include: { service: true },
      orderBy: { createdAt: 'desc' },
    });

    return credentials.map((c) => this.mapToMetadataResponse(c));
  }

  /**
   * Gets metadata for a specific credential. Secrets are strictly omitted/redacted.
   */
  async getCredentialMetadata(
    orgId: string,
    credentialId: string,
  ): Promise<VaultCredentialMetadataResponse> {
    const credential = await prisma.vaultCredential.findFirst({
      where: { id: credentialId, organizationId: orgId },
      include: { service: true },
    });

    if (!credential) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Vault credential not found',
      });
    }

    return this.mapToMetadataResponse(credential);
  }

  /**
   * Authorized Decryption of a Vault Credential.
   * Decrypts the per-record DEK via KMS and decrypts the AES-256-GCM payload in memory.
   * Logs an immutable audit event for every access.
   */
  async decryptCredentialById(
    orgId: string,
    credentialId: string,
    actorUserId?: string,
  ): Promise<DecryptedVaultCredentialResponse> {
    const credential = await prisma.vaultCredential.findFirst({
      where: { id: credentialId, organizationId: orgId },
    });

    if (!credential) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Vault credential not found',
      });
    }

    const decryptedPayload = await this.decryptSecretPayload(
      credential.encryptedDek,
      credential.encryptedData,
      credential.ivHex,
      credential.authTagHex,
      credential.keyVersion,
    );

    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    // Audit the decryption event
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: validActorId,
        action: 'VAULT_CREDENTIAL_DECRYPTED',
        entityType: 'VaultCredential',
        entityId: credential.id,
        metadataJson: {
          name: credential.name,
          targetType: credential.targetType,
          environment: credential.environment,
          keyFingerprint: credential.keyFingerprint,
          keyVersion: credential.keyVersion,
        },
      },
    });

    return {
      id: credential.id,
      organizationId: credential.organizationId,
      name: credential.name,
      targetType: credential.targetType,
      environment: credential.environment,
      keyFingerprint: credential.keyFingerprint,
      keyVersion: credential.keyVersion,
      decryptedPayload,
      metadataJson: credential.metadataJson as Record<string, unknown> | null,
      accessedAt: new Date().toISOString(),
    };
  }

  /**
   * Updates credential metadata or optionally rotates secret payload.
   */
  async updateCredential(
    orgId: string,
    credentialId: string,
    data: UpdateVaultCredentialRequest,
    actorUserId?: string,
  ): Promise<VaultCredentialMetadataResponse> {
    const existing = await prisma.vaultCredential.findFirst({
      where: { id: credentialId, organizationId: orgId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Vault credential not found',
      });
    }

    let encryptionFields = {};
    if (data.secretPayload && Object.keys(data.secretPayload).length > 0) {
      const encrypted = await this.encryptSecretPayload(data.secretPayload);
      encryptionFields = {
        encryptedDek: encrypted.encryptedDek,
        encryptedData: encrypted.encryptedData,
        ivHex: encrypted.ivHex,
        authTagHex: encrypted.authTagHex,
        keyVersion: encrypted.keyVersion,
        keyFingerprint: encrypted.keyFingerprint,
        lastRotatedAt: new Date(),
      };
    }

    const updated = await prisma.vaultCredential.update({
      where: { id: credentialId },
      data: {
        ...(data.name ? { name: data.name.trim() } : {}),
        ...(data.environment ? { environment: data.environment } : {}),
        ...(data.serviceId !== undefined ? { serviceId: data.serviceId } : {}),
        ...(data.metadataJson ? { metadataJson: data.metadataJson as any } : {}),
        ...encryptionFields,
      },
      include: { service: true },
    });

    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: validActorId,
        action: 'VAULT_CREDENTIAL_UPDATED',
        entityType: 'VaultCredential',
        entityId: updated.id,
        metadataJson: {
          name: updated.name,
          targetType: updated.targetType,
          secretRotated: Object.keys(encryptionFields).length > 0,
        },
      },
    });

    return this.mapToMetadataResponse(updated);
  }

  /**
   * Explicitly rotates a credential secret payload (generates new DEK, IV, and auth tag).
   */
  async rotateCredentialSecret(
    orgId: string,
    credentialId: string,
    data: RotateVaultCredentialRequest,
    actorUserId?: string,
  ): Promise<VaultCredentialMetadataResponse> {
    return this.updateCredential(
      orgId,
      credentialId,
      { secretPayload: data.newSecretPayload },
      actorUserId,
    );
  }

  /**
   * Master Key Rotation Strategy:
   * Rotates the KMS Master Key (KEK) and re-encrypts all stored DEKs under the new Master Key version.
   * Does NOT decrypt or re-encrypt the underlying data payloads (Zero exposure of plaintext secrets).
   */
  async rotateMasterKeyAndReEncryptDeks(
    actorUserId?: string,
  ): Promise<{ credentialsUpdated: number; newKeyVersion: number }> {
    const { newKeyVersion } = await this.kmsProvider.rotateMasterKey();

    const staleCredentials = await prisma.vaultCredential.findMany({
      where: { keyVersion: { lt: newKeyVersion } },
    });

    let updatedCount = 0;

    for (const cred of staleCredentials) {
      // 1. Decrypt DEK using old key version
      const plaintextDek = await this.kmsProvider.decryptDataKey(cred.encryptedDek, cred.keyVersion);

      // 2. Re-encrypt DEK using the new Master Key version
      const { encryptedKeyBase64 } = await this.kmsProvider.encryptDataKey(plaintextDek);

      // 3. Zero out plaintext buffer
      plaintextDek.fill(0);

      // 4. Update record in database
      await prisma.vaultCredential.update({
        where: { id: cred.id },
        data: {
          encryptedDek: encryptedKeyBase64,
          keyVersion: newKeyVersion,
        },
      });

      updatedCount += 1;
    }

    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    // System-level audit log
    const firstOrg = staleCredentials[0]?.organizationId;
    if (firstOrg) {
      await prisma.auditLog.create({
        data: {
          organizationId: firstOrg,
          actorUserId: validActorId,
          action: 'VAULT_MASTER_KEY_ROTATED',
          entityType: 'KmsProvider',
          entityId: `kms-v${newKeyVersion}`,
          metadataJson: {
            newKeyVersion,
            credentialsUpdated: updatedCount,
          },
        },
      });
    }

    return { credentialsUpdated: updatedCount, newKeyVersion };
  }

  /**
   * Deletes and revokes a vault credential.
   */
  async deleteCredential(
    orgId: string,
    credentialId: string,
    actorUserId?: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await prisma.vaultCredential.findFirst({
      where: { id: credentialId, organizationId: orgId },
    });

    if (!existing) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Vault credential not found',
      });
    }

    await prisma.vaultCredential.delete({
      where: { id: credentialId },
    });

    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: validActorId,
        action: 'VAULT_CREDENTIAL_DELETED',
        entityType: 'VaultCredential',
        entityId: credentialId,
        metadataJson: { name: existing.name, targetType: existing.targetType },
      },
    });

    return { success: true, message: 'Vault credential successfully deleted and revoked' };
  }

  // ---------------------------------------------------------------------------
  // Internal Envelope Encryption & Decryption Helpers
  // ---------------------------------------------------------------------------

  private async encryptSecretPayload(payload: Record<string, unknown>) {
    const payloadString = JSON.stringify(payload);

    // 1. Generate non-reversible cryptographic fingerprint
    const keyFingerprint = crypto.createHash('sha256').update(payloadString).digest('hex').substring(0, 16);

    // 2. Generate random 256-bit Data Encryption Key (DEK)
    const dek = crypto.randomBytes(32);

    // 3. Encrypt DEK via KMS provider with Master Key (KEK)
    const { encryptedKeyBase64: encryptedDek, keyVersion } = await this.kmsProvider.encryptDataKey(dek);

    // 4. Encrypt payload via AES-256-GCM using DEK and 96-bit IV
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', dek, iv);
    const encryptedDataBuffer = Buffer.concat([
      cipher.update(payloadString, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();

    // 5. Zero out plaintext DEK from memory
    dek.fill(0);

    return {
      encryptedDek,
      encryptedData: encryptedDataBuffer.toString('base64'),
      ivHex: iv.toString('hex'),
      authTagHex: authTag.toString('hex'),
      keyVersion,
      keyFingerprint,
    };
  }

  private async decryptSecretPayload(
    encryptedDek: string,
    encryptedDataBase64: string,
    ivHex: string,
    authTagHex: string,
    keyVersion: number,
  ): Promise<Record<string, unknown>> {
    // 1. Decrypt DEK via KMS provider
    let dek: Buffer;
    try {
      dek = await this.kmsProvider.decryptDataKey(encryptedDek, keyVersion);
    } catch {
      throw new BadRequestException({
        code: 'KMS_DECRYPTION_FAILED',
        message: 'Failed to decrypt Data Encryption Key via KMS provider',
      });
    }

    // 2. Decrypt AES-256-GCM ciphertext using DEK, IV, and Auth Tag
    try {
      const iv = Buffer.from(ivHex, 'hex');
      const authTag = Buffer.from(authTagHex, 'hex');
      const ciphertext = Buffer.from(encryptedDataBase64, 'base64');

      const decipher = crypto.createDecipheriv('aes-256-gcm', dek, iv);
      decipher.setAuthTag(authTag);

      const decryptedBuffer = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      const parsed = JSON.parse(decryptedBuffer.toString('utf8'));
      return parsed;
    } catch {
      throw new BadRequestException({
        code: 'AUTHENTICATION_TAG_VERIFICATION_FAILED',
        message: 'Decryption failed: integrity authentication tag mismatch or corrupted ciphertext',
      });
    } finally {
      // Always zero out plaintext DEK
      if (dek!) {
        dek.fill(0);
      }
    }
  }

  private mapToMetadataResponse(c: any): VaultCredentialMetadataResponse {
    return {
      id: c.id,
      organizationId: c.organizationId,
      serviceId: c.serviceId,
      serviceName: c.service?.name || null,
      name: c.name,
      targetType: c.targetType,
      environment: c.environment,
      keyFingerprint: c.keyFingerprint,
      keyVersion: c.keyVersion,
      metadataJson: c.metadataJson as Record<string, unknown> | null,
      hasSecret: true,
      lastRotatedAt: c.lastRotatedAt.toISOString(),
      lastVerifiedAt: c.lastVerifiedAt ? c.lastVerifiedAt.toISOString() : null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }
}
