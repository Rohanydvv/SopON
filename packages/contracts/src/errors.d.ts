export declare const ErrorCodes: {
    readonly BAD_REQUEST: "BAD_REQUEST";
    readonly VALIDATION_ERROR: "VALIDATION_ERROR";
    readonly UNAUTHORIZED: "UNAUTHORIZED";
    readonly FORBIDDEN: "FORBIDDEN";
    readonly NOT_FOUND: "NOT_FOUND";
    readonly CONFLICT: "CONFLICT";
    readonly RATE_LIMITED: "RATE_LIMITED";
    readonly INTERNAL_SERVER_ERROR: "INTERNAL_SERVER_ERROR";
    readonly TENANT_MISMATCH: "TENANT_MISMATCH";
    readonly ORGANIZATION_NOT_FOUND: "ORGANIZATION_NOT_FOUND";
    readonly INVALID_CREDENTIALS: "INVALID_CREDENTIALS";
    readonly TOKEN_EXPIRED: "TOKEN_EXPIRED";
    readonly INVALID_TOKEN: "INVALID_TOKEN";
    readonly INCIDENT_NOT_FOUND: "INCIDENT_NOT_FOUND";
    readonly INVALID_STATE_TRANSITION: "INVALID_STATE_TRANSITION";
    readonly SERVICE_NOT_FOUND: "SERVICE_NOT_FOUND";
    readonly TEAM_NOT_FOUND: "TEAM_NOT_FOUND";
    readonly SLA_POLICY_NOT_FOUND: "SLA_POLICY_NOT_FOUND";
    readonly AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR";
};
export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];
//# sourceMappingURL=errors.d.ts.map