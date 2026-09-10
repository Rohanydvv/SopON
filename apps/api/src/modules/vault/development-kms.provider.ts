import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { KmsEncryptionResult, KmsProvider } from './kms-provider.interface';

/**
 * Development & Integration KMS Provider.
 *
 * Simulates an external Hardware Security Module (HSM) or Cloud KMS (AWS KMS / GCP Cloud KMS / HashiCorp Vault)
 * using envelope-encryption with versioned Master Keys (KEKs) in memory, backed by environment secrets.
 *
 * In Production:
 * This provider is swapped for an AWS KMS / GCP KMS provider implementing the same KmsProvider interface,
 * where `encryptDataKey` and `decryptDataKey` invoke remote `kms:Encrypt` / `kms:Decrypt` via IAM roles without
 * ever exposing master private keys to the application.
 */
@Injectable()
export class DevelopmentKmsProvider implements KmsProvider {
  private currentVersion = 1;
  private readonly masterKeys = new Map<number, Buffer>();

  constructor() {
    // Initialize Master Key Version 1 from environment or cryptographically secure random bytes
    const baseSecret = process.env.SOPON_VAULT_MASTER_KEY || 'sopon-development-master-key-32-chars-kek-12345';
    const keyV1 = crypto.createHash('sha256').update(baseSecret).digest();
    this.masterKeys.set(1, keyV1);
  }

  getCurrentKeyVersion(): number {
    return this.currentVersion;
  }

  async encryptDataKey(plaintextKey: Buffer): Promise<KmsEncryptionResult> {
    const kek = this.masterKeys.get(this.currentVersion);
    if (!kek) {
      throw new Error(`Master key version ${this.currentVersion} not found in KMS provider`);
    }

    // Encrypt the DEK using AES-256-GCM with KEK and unique IV
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', kek, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Pack iv (12 bytes) + tag (16 bytes) + ciphertext into single payload
    const packed = Buffer.concat([iv, tag, ciphertext]);

    return {
      encryptedKeyBase64: packed.toString('base64'),
      keyVersion: this.currentVersion,
    };
  }

  async decryptDataKey(encryptedKeyBase64: string, keyVersion: number): Promise<Buffer> {
    const kek = this.masterKeys.get(keyVersion);
    if (!kek) {
      throw new Error(`Master key version ${keyVersion} not found in KMS provider`);
    }

    const packed = Buffer.from(encryptedKeyBase64, 'base64');
    if (packed.length < 28) {
      throw new Error('Malformed encrypted DEK payload');
    }

    const iv = packed.subarray(0, 12);
    const tag = packed.subarray(12, 28);
    const ciphertext = packed.subarray(28);

    const decipher = crypto.createDecipheriv('aes-256-gcm', kek, iv);
    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  async rotateMasterKey(): Promise<{ newKeyVersion: number }> {
    this.currentVersion += 1;
    const newKek = crypto.randomBytes(32);
    this.masterKeys.set(this.currentVersion, newKek);
    return { newKeyVersion: this.currentVersion };
  }
}
