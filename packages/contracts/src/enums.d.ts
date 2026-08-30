export declare enum UserRole {
    OWNER = "OWNER",
    ADMIN = "ADMIN",
    MANAGER = "MANAGER",
    ENGINEER = "ENGINEER",
    VIEWER = "VIEWER"
}
export declare enum MembershipStatus {
    ACTIVE = "ACTIVE",
    INVITED = "INVITED",
    SUSPENDED = "SUSPENDED"
}
export declare enum IncidentStatus {
    OPEN = "OPEN",
    ACKNOWLEDGED = "ACKNOWLEDGED",
    INVESTIGATING = "INVESTIGATING",
    RESOLVED = "RESOLVED",
    CLOSED = "CLOSED",
    REOPENED = "REOPENED"
}
export declare enum IncidentSeverity {
    CRITICAL = "CRITICAL",
    HIGH = "HIGH",
    MEDIUM = "MEDIUM",
    LOW = "LOW"
}
export declare enum IncidentPriority {
    P1 = "P1",
    P2 = "P2",
    P3 = "P3",
    P4 = "P4"
}
export declare enum ServiceEnvironment {
    PRODUCTION = "PRODUCTION",
    STAGING = "STAGING",
    DEVELOPMENT = "DEVELOPMENT"
}
export declare enum ServiceStatus {
    OPERATIONAL = "OPERATIONAL",
    DEGRADED = "DEGRADED",
    OUTAGE = "OUTAGE",
    MAINTENANCE = "MAINTENANCE"
}
export declare enum AIAnalysisType {
    CLASSIFICATION = "CLASSIFICATION",
    SUMMARIZATION = "SUMMARIZATION",
    INVESTIGATION = "INVESTIGATION",
    RCA = "RCA",
    RESOLUTION_SUGGESTION = "RESOLUTION_SUGGESTION"
}
export declare enum AIAnalysisStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED"
}
export declare enum NotificationChannel {
    IN_APP = "IN_APP",
    EMAIL = "EMAIL",
    SLACK = "SLACK"
}
//# sourceMappingURL=enums.d.ts.map