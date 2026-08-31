import { z } from 'zod';
import { UserRole } from './enums';

export const CreateOrganizationRequestSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(100),
  slug: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'Slug must only contain lowercase alphanumeric characters and hyphens')
    .optional(),
});

export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;

export const UpdateOrganizationRequestSchema = z.object({
  name: z.string().min(2).max(100).optional(),
});

export type UpdateOrganizationRequest = z.infer<typeof UpdateOrganizationRequestSchema>;

export interface OrganizationResponse {
  id: string;
  name: string;
  slug: string;
  plan: string;
  role: UserRole;
  createdAt: string;
}