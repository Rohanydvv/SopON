import { IncidentPriority, IncidentSeverity } from '@sopon/contracts';

export interface ClassifyIncidentInput {
  title: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface ClassificationResult {
  category: string;
  severitySuggestion: IncidentSeverity;
  prioritySuggestion: IncidentPriority;
  confidence: number;
  reasoningSummary: string;
  evidenceIds: string[];
}

export interface SummarizeIncidentInput {
  title: string;
  description: string;
  events: Array<{ type: string; payload?: unknown; occurredAt: string }>;
  comments: Array<{ authorName: string; body: string; createdAt: string }>;
}

export interface SummaryResult {
  summary: string;
  keyPoints: string[];
  impactAssessment: string;
}

export interface InvestigationInput {
  incidentTitle: string;
  incidentDescription: string;
  serviceName?: string;
  environment?: string;
  logsOrEvents?: string;
  relevantKnowledge?: string[];
}

export interface InvestigationResult {
  hypotheses: string[];
  evidence: string[];
  recommendedChecks: string[];
}

export interface RcaInput {
  incidentTitle: string;
  incidentDescription: string;
  timeline: Array<{ event: string; timestamp: string }>;
  resolutionNotes: string;
}

export interface RcaResult {
  rootCause: string;
  contributingFactors: string[];
  timelineSummary: string;
  preventionSteps: string[];
  confidence: number;
}

export interface AIProvider {
  classifyIncident(input: ClassifyIncidentInput): Promise<ClassificationResult>;
  summarizeIncident(input: SummarizeIncidentInput): Promise<SummaryResult>;
  investigateIncident(input: InvestigationInput): Promise<InvestigationResult>;
  generateRcaDraft(input: RcaInput): Promise<RcaResult>;
  embed(texts: string[]): Promise<number[][]>;
}
