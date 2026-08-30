import { z } from 'zod';
import { UserRole } from './enums';
export declare const RegisterRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
    name: z.ZodString;
    organizationName: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
    name: string;
    organizationName: string;
}, {
    email: string;
    password: string;
    name: string;
    organizationName: string;
}>;
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;
export declare const LoginRequestSchema: z.ZodObject<{
    email: z.ZodString;
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    email: string;
    password: string;
}, {
    email: string;
    password: string;
}>;
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export declare const RefreshTokenRequestSchema: z.ZodObject<{
    refreshToken: z.ZodString;
}, "strip", z.ZodTypeAny, {
    refreshToken: string;
}, {
    refreshToken: string;
}>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
export interface AuthSessionUser {
    id: string;
    email: string;
    name: string;
}
export interface UserOrganizationMembership {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: UserRole;
}
export interface AuthTokens {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}
export interface AuthResponseData {
    user: AuthSessionUser;
    memberships: UserOrganizationMembership[];
    activeOrganizationId: string;
    tokens: AuthTokens;
}
//# sourceMappingURL=auth.dto.d.ts.map