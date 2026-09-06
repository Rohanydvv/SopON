import { z } from 'zod';
import { DocumentSourceType } from './sop.dto';
import { IncidentSeverity } from './enums';

export const RemediationRiskTierSchema = z.enum([
  'SAFE_AUTOMATIC',
  'REQUIRES_APPROVAL',
  'MANUAL_ESCALATION',
]);

export type RemediationRiskTier = z.infer<typeof RemediationRiskTierSchema>;

export const RemediationActionTypeSchema = z.enum([
  'RESTART_POD',
  'SCALE_SERVICE',
  'ROLLBACK_DEPLOYMENT',
  'CLEAR_CACHE',
  'HTTP_WEBHOOK',
  'CONFIG_UPDATE',
  'RUN_COMMAND',
]);

export type RemediationActionType = z.infer<typeof RemediationActionTypeSchema>;

export interface DiagnosticSymptom {
  signal: string;
  type: 'METRIC' | 'LOG' | 'ERROR_CODE' | 'LATENCY' | 'TRAFFIC';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface IncidentUnderstanding {
  incidentId: string;
  summary: string;
  serviceName: string | null;
  severity: IncidentSeverity;
  detectedSymptoms: DiagnosticSymptom[];
}

export interface IncidentInvestigationContext {
  serviceMetadata: {
    id?: string;
    name?: string;
    tier?: string;
    environment?: string;
  } | null;
  historicalIncidentsCount: number;
  relatedIncidents: Array<{
    id: string;
    title: string;
    status: string;
    resolvedAt?: string | null;
  }>;
}

export interface RetrievedKnowledgeEvidence {
  matchedDocumentsCount: number;
  documents: Array<{
    documentId: string;
    title: string;
    sourceType: DocumentSourceType;
    sourceUrl?: string | null;
    relevanceScore: number;
    matchedSnippet: string;
    applicableProcedures: string[];
  }>;
}

export interface EvidenceSignal {
  signal: string;
  source: string;
  observation: string;
}

export interface RootCauseHypothesis {
  hypothesis: string;
  likelihood: 'HIGH' | 'MEDIUM' | 'LOW';
  supportingEvidence: string[];
}

export interface RootCauseAnalysis {
  primaryRootCause: string;
  confidenceScore: number; // 0.0 to 1.0
  confidenceLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  isDefinitive: boolean;
  hypotheses: RootCauseHypothesis[];
  contributingFactors: string[];
  evidenceChain: EvidenceSignal[];
}

export interface ExecutableRemediationAction {
  actionId: string;
  order: number;
  actionType: RemediationActionType;
  targetService: string;
  description: string;
  commandOrPayload?: string;
  isDestructive: boolean;
  riskLevel: RemediationRiskTier;
}

export interface RemediationPlan {
  riskTier: RemediationRiskTier;
  recommendedMode: 'AUTONOMOUS' | 'SUPERVISED' | 'MANUAL';
  estimatedRecoveryTimeSec: number;
  actions: ExecutableRemediationAction[];
}

export interface VerificationProbe {
  metricOrEndpoint: string;
  expectedCondition: string;
  timeoutSec: number;
}

export interface VerificationCriteria {
  preExecutionSafetyChecks: string[];
  postExecutionVerificationProbes: VerificationProbe[];
}

export interface EscalationPackage {
  summary: string;
  investigationSummary: string;
  evidenceSummary: string[];
  candidateCauses: string[];
  actionsConsidered: string[];
  recommendedNextSteps: string[];
}

export interface AutonomousReadiness {
  isReady: boolean;
  blockers?: string[];
  escalationPackage?: EscalationPackage;
}

export interface IncidentAnalysisResponse {
  incidentId: string;
  organizationId: string;
  understand: IncidentUnderstanding;
  investigate: IncidentInvestigationContext;
  retrieve: RetrievedKnowledgeEvidence;
  reasonRca: RootCauseAnalysis;
  decidePlan: RemediationPlan;
  verify: VerificationCriteria;
  resolveEscalate: AutonomousReadiness;
  createdAt: string;
}