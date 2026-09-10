import { z } from 'zod';
import { ServiceEnvironment } from './enums';

export const VaultTargetTypeSchema = z.enum([
  'KUBERNETES',
  'DATADOG',
  'PROMETHEUS',
  'AWS',
  'HTTP_ENDPOINT',
  'REDIS',
  'POSTGRES',
  'CUSTOM',
]);

export type VaultTargetType = z.infer<typeof VaultTargetTypeSchema>;

export const CreateVaultCredentialRequestSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100),
  targetType: VaultTargetTypeSchema,
  environment: z.nativeEnum(ServiceEnvironment).default(ServiceEnvironment.PRODUCTION),
  serviceId: z.string().uuid().optional(),
  secretPayload: z.record(z.unknown()).refine((obj) => Object.keys(obj).length > 0, {
    message: 'Secret payload must contain at least one key-value pair',
  }),
  metadataJson: z.record(z.unknown()).optional(),
});

export type CreateVaultCredentialRequest = z.infer<typeof CreateVaultCredentialRequestSchema>;

export const UpdateVaultCredentialRequestSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  environment: z.nativeEnum(ServiceEnvironment).optional(),
  serviceId: z.string().uuid().nullable().optional(),
  secretPayload: z.record(z.unknown()).optional(),
  metadataJson: z.record(z.unknown()).optional(),
});

export type UpdateVaultCredentialRequest = z.infer<typeof UpdateVaultCredentialRequestSchema>;

export const RotateVaultCredentialRequestSchema = z.object({
  newSecretPayload: z.record(z.unknown()).refine((obj) => Object.keys(obj).length > 0, {
    message: 'New secret payload must contain at least one key-value pair',
  }),
});

export type RotateVaultCredentialRequest = z.infer<typeof RotateVaultCredentialRequestSchema>;

export interface VaultCredentialMetadataResponse {
  id: string;
  organizationId: string;
  serviceId: string | null;
  serviceName: string | null;
  name: string;
  targetType: string;
  environment: string;
  keyFingerprint: string;
  keyVersion: number;
  metadataJson: Record<string, unknown> | null;
  hasSecret: boolean;
  lastRotatedAt: string;
  lastVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecryptedVaultCredentialResponse {
  id: string;
  organizationId: string;
  name: string;
  targetType: string;
  environment: string;
  keyFingerprint: string;
  keyVersion: number;
  decryptedPayload: Record<string, unknown>;
  metadataJson: Record<string, unknown> | null;
  accessedAt: string;
}
