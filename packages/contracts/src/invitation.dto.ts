import { z } from 'zod';
import { UserRole } from './enums';

export const CreateInvitationRequestSchema = z.object({
  email: z.string().email('Valid email is required'),
  role: z.nativeEnum(UserRole).default(UserRole.ENGINEER),
});

export type CreateInvitationRequest = z.infer<typeof CreateInvitationRequestSchema>;

export const AcceptInvitationRequestSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  name: z.string().min(2).optional(),
  password: z.string().min(8).optional(),
});

export type AcceptInvitationRequest = z.infer<typeof AcceptInvitationRequestSchema>;

export interface InvitationResponse {
  id: string;
  email: string;
  role: UserRole;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  expiresAt: string;
}