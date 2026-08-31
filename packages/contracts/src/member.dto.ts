import { z } from 'zod';
import { MembershipStatus, UserRole } from './enums';

export const UpdateMemberRoleRequestSchema = z.object({
  role: z.nativeEnum(UserRole),
});

export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;

export interface MemberResponse {
  id: string;
  userId: string;
  email: string;
  name: string;
  role: UserRole;
  status: MembershipStatus;
  createdAt: string;
}