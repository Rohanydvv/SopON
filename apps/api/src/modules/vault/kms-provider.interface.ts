export interface KmsEncryptionResult {
  encryptedKeyBase64: string;
  keyVersion: number;
}

export interface KmsProvider {
  /**
   * Encrypts a plaintext Data Encryption Key (DEK) using the active Key Encryption Key (KEK) / Master Key.
   */
  encryptDataKey(plaintextKey: Buffer): Promise<KmsEncryptionResult>;

  /**
   * Decrypts an encrypted Data Encryption Key (DEK) using the specified version of the Master Key.
   */
  decryptDataKey(encryptedKeyBase64: string, keyVersion: number): Promise<Buffer>;

  /**
   * Rotates the Master Key Encryption Key (KEK) to a new version.
   */
  rotateMasterKey(): Promise<{ newKeyVersion: number }>;

  /**
   * Gets the active Master Key version.
   */
  getCurrentKeyVersion(): number;
}
