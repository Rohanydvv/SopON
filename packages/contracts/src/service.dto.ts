import { z } from 'zod';
import { ServiceEnvironment, ServiceStatus } from './enums';

export const CreateServiceRequestSchema = z.object({
  name: z.string().min(2, 'Service name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2)
    .max(60)
    .regex(/^[a-z0-9-]+$/, 'Slug must contain only lowercase alphanumeric characters and hyphens')
    .optional(),
  description: z.string().max(500).optional(),
  tier: z.string().max(20).optional().default('Tier 2'),
  environment: z.nativeEnum(ServiceEnvironment).default(ServiceEnvironment.PRODUCTION),
  repositoryUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

export type CreateServiceRequest = z.infer<typeof CreateServiceRequestSchema>;

export const UpdateServiceRequestSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(500).optional(),
  tier: z.string().max(20).optional(),
  environment: z.nativeEnum(ServiceEnvironment).optional(),
  status: z.nativeEnum(ServiceStatus).optional(),
  repositoryUrl: z.string().url().optional().or(z.literal('')),
});

export type UpdateServiceRequest = z.infer<typeof UpdateServiceRequestSchema>;

export interface ServiceResponse {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  description?: string | null;
  tier: string;
  environment: ServiceEnvironment;
  status: ServiceStatus;
  repositoryUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}