"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationChannel = exports.AIAnalysisStatus = exports.AIAnalysisType = exports.ServiceStatus = exports.ServiceEnvironment = exports.IncidentPriority = exports.IncidentSeverity = exports.IncidentStatus = exports.MembershipStatus = exports.UserRole = void 0;
var UserRole;
(function (UserRole) {
    UserRole["OWNER"] = "OWNER";
    UserRole["ADMIN"] = "ADMIN";
    UserRole["MANAGER"] = "MANAGER";
    UserRole["ENGINEER"] = "ENGINEER";
    UserRole["VIEWER"] = "VIEWER";
})(UserRole || (exports.UserRole = UserRole = {}));
var MembershipStatus;
(function (MembershipStatus) {
    MembershipStatus["ACTIVE"] = "ACTIVE";
    MembershipStatus["INVITED"] = "INVITED";
    MembershipStatus["SUSPENDED"] = "SUSPENDED";
})(MembershipStatus || (exports.MembershipStatus = MembershipStatus = {}));
var IncidentStatus;
(function (IncidentStatus) {
    IncidentStatus["OPEN"] = "OPEN";
    IncidentStatus["ACKNOWLEDGED"] = "ACKNOWLEDGED";
    IncidentStatus["INVESTIGATING"] = "INVESTIGATING";
    IncidentStatus["RESOLVED"] = "RESOLVED";
    IncidentStatus["CLOSED"] = "CLOSED";
    IncidentStatus["REOPENED"] = "REOPENED";
})(IncidentStatus || (exports.IncidentStatus = IncidentStatus = {}));
var IncidentSeverity;
(function (IncidentSeverity) {
    IncidentSeverity["CRITICAL"] = "CRITICAL";
    IncidentSeverity["HIGH"] = "HIGH";
    IncidentSeverity["MEDIUM"] = "MEDIUM";
    IncidentSeverity["LOW"] = "LOW";
})(IncidentSeverity || (exports.IncidentSeverity = IncidentSeverity = {}));
var IncidentPriority;
(function (IncidentPriority) {
    IncidentPriority["P1"] = "P1";
    IncidentPriority["P2"] = "P2";
    IncidentPriority["P3"] = "P3";
    IncidentPriority["P4"] = "P4";
})(IncidentPriority || (exports.IncidentPriority = IncidentPriority = {}));
var ServiceEnvironment;
(function (ServiceEnvironment) {
    ServiceEnvironment["PRODUCTION"] = "PRODUCTION";
    ServiceEnvironment["STAGING"] = "STAGING";
    ServiceEnvironment["DEVELOPMENT"] = "DEVELOPMENT";
})(ServiceEnvironment || (exports.ServiceEnvironment = ServiceEnvironment = {}));
var ServiceStatus;
(function (ServiceStatus) {
    ServiceStatus["OPERATIONAL"] = "OPERATIONAL";
    ServiceStatus["DEGRADED"] = "DEGRADED";
    ServiceStatus["OUTAGE"] = "OUTAGE";
    ServiceStatus["MAINTENANCE"] = "MAINTENANCE";
})(ServiceStatus || (exports.ServiceStatus = ServiceStatus = {}));
var AIAnalysisType;
(function (AIAnalysisType) {
    AIAnalysisType["CLASSIFICATION"] = "CLASSIFICATION";
    AIAnalysisType["SUMMARIZATION"] = "SUMMARIZATION";
    AIAnalysisType["INVESTIGATION"] = "INVESTIGATION";
    AIAnalysisType["RCA"] = "RCA";
    AIAnalysisType["RESOLUTION_SUGGESTION"] = "RESOLUTION_SUGGESTION";
})(AIAnalysisType || (exports.AIAnalysisType = AIAnalysisType = {}));
var AIAnalysisStatus;
(function (AIAnalysisStatus) {
    AIAnalysisStatus["PENDING"] = "PENDING";
    AIAnalysisStatus["PROCESSING"] = "PROCESSING";
    AIAnalysisStatus["COMPLETED"] = "COMPLETED";
    AIAnalysisStatus["FAILED"] = "FAILED";
})(AIAnalysisStatus || (exports.AIAnalysisStatus = AIAnalysisStatus = {}));
var NotificationChannel;
(function (NotificationChannel) {
    NotificationChannel["IN_APP"] = "IN_APP";
    NotificationChannel["EMAIL"] = "EMAIL";
    NotificationChannel["SLACK"] = "SLACK";
})(NotificationChannel || (exports.NotificationChannel = NotificationChannel = {}));
//# sourceMappingURL=enums.js.map