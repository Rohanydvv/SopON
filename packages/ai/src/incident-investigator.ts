import {
  AutonomousReadiness,
  DiagnosticSymptom,
  IncidentAnalysisResponse,
  IncidentInvestigationContext,
  IncidentSeverity,
  IncidentUnderstanding,
  RemediationPlan,
  RemediationRiskTier,
  RetrievedKnowledgeEvidence,
  RootCauseAnalysis,
  VerificationCriteria,
} from '@sopon/contracts';

const STOP_WORDS = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'how', 'what', 'where', 'when',
  'why', 'does', 'do', 'did', 'in', 'on', 'at', 'to', 'for', 'with', 'by', 'from',
  'of', 'and', 'or', 'it', 'this', 'that', 'these', 'those', 'work', 'works', 'can',
  'be', 'has', 'have', 'had', 'as', 'about', 'tell', 'me', 'explain',
]);

export interface RawIncidentInput {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  severity: IncidentSeverity;
  serviceId?: string | null;
  serviceName?: string | null;
  serviceTier?: string | null;
  serviceEnvironment?: string | null;
  createdAt: string;
}

export interface RawHistoricalIncident {
  id: string;
  title: string;
  status: string;
  resolvedAt?: string | null;
}

export interface RawSopMatch {
  documentId: string;
  title: string;
  sourceType: string;
  sourceUrl?: string | null;
  relevanceScore: number;
  matchedSnippet: string;
  remediationSteps: string[];
}

/**
 * 1. UNDERSTAND: Extract symptoms, categorize signals, and normalize incident data.
 */
export function understandIncident(incident: RawIncidentInput): IncidentUnderstanding {
  const fullText = `${incident.title} ${incident.description}`.toLowerCase();
  const symptoms: DiagnosticSymptom[] = [];

  // Error code detection
  if (fullText.includes('502') || fullText.includes('bad gateway')) {
    symptoms.push({
      signal: 'HTTP 502 Bad Gateway Spike',
      type: 'ERROR_CODE',
      severity: 'CRITICAL',
    });
  } else if (fullText.includes('504') || fullText.includes('gateway timeout') || fullText.includes('timeout')) {
    symptoms.push({
      signal: 'Upstream Timeout / 504 Gateway Timeout',
      type: 'LATENCY',
      severity: 'HIGH',
    });
  } else if (fullText.includes('500') || fullText.includes('internal server error')) {
    symptoms.push({
      signal: 'HTTP 500 Internal Server Error Spike',
      type: 'ERROR_CODE',
      severity: 'HIGH',
    });
  }

  // Connection & Resource exhaustion signals
  if (fullText.includes('connection pool') || fullText.includes('pool exhaustion') || fullText.includes('connection limit')) {
    symptoms.push({
      signal: 'Client Connection Pool Exhaustion',
      type: 'METRIC',
      severity: 'CRITICAL',
    });
  }

  if (fullText.includes('cpu') || fullText.includes('high load') || fullText.includes('throttle')) {
    symptoms.push({
      signal: 'High CPU Utilization / Throttling',
      type: 'METRIC',
      severity: 'HIGH',
    });
  }

  if (fullText.includes('memory') || fullText.includes('oom') || fullText.includes('killed')) {
    symptoms.push({
      signal: 'Out Of Memory (OOM) Container Restarts',
      type: 'LOG',
      severity: 'CRITICAL',
    });
  }

  if (fullText.includes('latency') || fullText.includes('p99') || fullText.includes('slow response')) {
    symptoms.push({
      signal: 'High p99 Response Latency',
      type: 'LATENCY',
      severity: 'HIGH',
    });
  }

  // Generic fallback if no specific pattern matched
  if (symptoms.length === 0) {
    symptoms.push({
      signal: incident.title,
      type: 'METRIC',
      severity: incident.severity === 'CRITICAL' ? 'CRITICAL' : 'MEDIUM',
    });
  }

  return {
    incidentId: incident.id,
    summary: `${incident.title}: ${incident.description}`,
    serviceName: incident.serviceName || null,
    severity: incident.severity,
    detectedSymptoms: symptoms,
  };
}

/**
 * 2. INVESTIGATE: Gather metadata, service environment, and related historical incidents.
 */
export function investigateIncidentContext(
  incident: RawIncidentInput,
  historicalIncidents: RawHistoricalIncident[] = [],
): IncidentInvestigationContext {
  const serviceMetadata = incident.serviceId
    ? {
        id: incident.serviceId,
        name: incident.serviceName || undefined,
        tier: incident.serviceTier || undefined,
        environment: incident.serviceEnvironment || undefined,
      }
    : null;

  return {
    serviceMetadata,
    historicalIncidentsCount: historicalIncidents.length,
    relatedIncidents: historicalIncidents.slice(0, 3).map((h) => ({
      id: h.id,
      title: h.title,
      status: h.status,
      resolvedAt: h.resolvedAt || null,
    })),
  };
}

/**
 * 3. RETRIEVE: Transform RAG search matches into structured knowledge evidence.
 */
export function retrieveKnowledgeEvidence(retrievedSops: RawSopMatch[] = []): RetrievedKnowledgeEvidence {
  const docs = retrievedSops.map((sop) => ({
    documentId: sop.documentId,
    title: sop.title,
    sourceType: sop.sourceType as any,
    sourceUrl: sop.sourceUrl || null,
    relevanceScore: Math.round(sop.relevanceScore * 100) / 100,
    matchedSnippet: sop.matchedSnippet,
    applicableProcedures: sop.remediationSteps,
  }));

  return {
    matchedDocumentsCount: docs.length,
    documents: docs,
  };
}

/**
 * 4. REASON / RCA: Isolate candidate root causes, formulate evidence chain, and assign confidence score.
 */
export function reasonRootCause(
  understanding: IncidentUnderstanding,
  investigation: IncidentInvestigationContext,
  knowledge: RetrievedKnowledgeEvidence,
): RootCauseAnalysis {
  const topDoc = knowledge.documents[0];
  const symptomsText = understanding.detectedSymptoms.map((s) => s.signal.toLowerCase()).join(' ');
  const combinedContext = `${understanding.summary} ${symptomsText}`.toLowerCase();

  // Check if topDoc genuinely matches incident content (prevent spurious correlation)
  let hasHighConfidenceDoc = false;
  if (topDoc && topDoc.relevanceScore >= 0.35) {
    const docTokens = `${topDoc.title} ${topDoc.matchedSnippet}`
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

    const incidentTokens = combinedContext
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w));

    const overlapCount = docTokens.filter((t) => incidentTokens.includes(t)).length;
    hasHighConfidenceDoc = overlapCount >= 2;
  }

  const isRedisPoolIssue =
    combinedContext.includes('redis') &&
    (combinedContext.includes('pool') || combinedContext.includes('connection') || combinedContext.includes('502'));

  let primaryRootCause = '';
  let confidenceScore = 0.50;
  let isDefinitive = false;
  const contributingFactors: string[] = [];
  const evidenceChain: Array<{ signal: string; source: string; observation: string }> = [];

  // Populate evidence chain from symptoms
  for (const sym of understanding.detectedSymptoms) {
    evidenceChain.push({
      signal: sym.signal,
      source: investigation.serviceMetadata?.name ? `${investigation.serviceMetadata.name} Telemetry` : 'Incident Alert Payload',
      observation: `Detected ${sym.type} anomaly flagged with ${sym.severity} severity.`,
    });
  }

  if (isRedisPoolIssue) {
    primaryRootCause = 'Redis Client Connection Pool Exhaustion causing HTTP 502 Bad Gateway timeouts on upstream requests.';
    contributingFactors.push('Sudden spike in concurrent traffic or unclosed Redis client handles.');
    contributingFactors.push('Max connection pool ceiling lower than active worker thread concurrency.');

    if (hasHighConfidenceDoc && topDoc) {
      confidenceScore = 0.92;
      isDefinitive = true;
      evidenceChain.push({
        signal: 'Operational Runbook Match',
        source: topDoc.title,
        observation: `Correlated with diagnostic procedures in "${topDoc.title}" (Relevance: ${Math.round(topDoc.relevanceScore * 100)}%).`,
      });
    } else {
      confidenceScore = 0.78;
      isDefinitive = true;
    }
  } else if (hasHighConfidenceDoc && topDoc) {
    primaryRootCause = `Service degradation matching known failure pattern in "${topDoc.title}".`;
    contributingFactors.push('Upstream dependency latency or resource constraint.');
    confidenceScore = Math.min(0.88, 0.50 + topDoc.relevanceScore * 0.8);
    isDefinitive = confidenceScore >= 0.75;
    evidenceChain.push({
      signal: 'SOP Documentation Match',
      source: topDoc.title,
      observation: `Correlated with documented remediation procedure (Relevance: ${Math.round(topDoc.relevanceScore * 100)}%).`,
    });
  } else {
    primaryRootCause = `Unclassified service degradation: ${understanding.detectedSymptoms[0]?.signal || understanding.summary}`;
    contributingFactors.push('Insufficient historical runbook correlation in knowledge base.');
    confidenceScore = 0.45;
    isDefinitive = false;
  }

  const confidenceLevel = confidenceScore >= 0.80 ? 'HIGH' : confidenceScore >= 0.60 ? 'MEDIUM' : 'LOW';

  return {
    primaryRootCause,
    confidenceScore: Math.round(confidenceScore * 100) / 100,
    confidenceLevel,
    isDefinitive,
    hypotheses: [
      {
        hypothesis: primaryRootCause,
        likelihood: confidenceLevel,
        supportingEvidence: evidenceChain.map((e) => `${e.source}: ${e.observation}`),
      },
    ],
    contributingFactors,
    evidenceChain,
  };
}

/**
 * 5. DECIDE & PLAN: Generate a structured, safety-tiered remediation plan with executable actions.
 */
export function decideRemediationPlan(
  understanding: IncidentUnderstanding,
  rca: RootCauseAnalysis,
  knowledge: RetrievedKnowledgeEvidence,
): RemediationPlan {
  const serviceName = understanding.serviceName || 'service-worker';
  const isRedisPoolIssue = rca.primaryRootCause.toLowerCase().includes('redis');

  if (isRedisPoolIssue) {
    return {
      riskTier: 'SAFE_AUTOMATIC',
      recommendedMode: 'AUTONOMOUS',
      estimatedRecoveryTimeSec: 60,
      actions: [
        {
          actionId: 'act-1',
          order: 1,
          actionType: 'CONFIG_UPDATE',
          targetService: serviceName,
          description: 'Increase REDIS_MAX_CONNECTIONS pool parameter and connection timeout ceiling.',
          commandOrPayload: 'helm upgrade --set redis.maxConnections=250',
          isDestructive: false,
          riskLevel: 'SAFE_AUTOMATIC',
        },
        {
          actionId: 'act-2',
          order: 2,
          actionType: 'RESTART_POD',
          targetService: serviceName,
          description: `Perform zero-downtime rolling restart of ${serviceName} worker pods to clear exhausted sockets.`,
          commandOrPayload: `kubectl rollout restart deployment/${serviceName}`,
          isDestructive: false,
          riskLevel: 'SAFE_AUTOMATIC',
        },
      ],
    };
  }

  // If SOP document has remediation steps, map them
  const topDoc = knowledge.documents[0];
  if (topDoc && topDoc.applicableProcedures.length > 0) {
    const actions = topDoc.applicableProcedures.map((proc, idx) => ({
      actionId: `act-${idx + 1}`,
      order: idx + 1,
      actionType: 'RUN_COMMAND' as const,
      targetService: serviceName,
      description: proc,
      isDestructive: false,
      riskLevel: (idx === 0 ? 'SAFE_AUTOMATIC' : 'REQUIRES_APPROVAL') as RemediationRiskTier,
    }));

    return {
      riskTier: 'REQUIRES_APPROVAL',
      recommendedMode: 'SUPERVISED',
      estimatedRecoveryTimeSec: 120,
      actions,
    };
  }

  // Fallback safe restart
  return {
    riskTier: 'REQUIRES_APPROVAL',
    recommendedMode: 'SUPERVISED',
    estimatedRecoveryTimeSec: 180,
    actions: [
      {
        actionId: 'act-1',
        order: 1,
        actionType: 'RESTART_POD',
        targetService: serviceName,
        description: `Gracefully restart ${serviceName} instances to restore baseline health.`,
        commandOrPayload: `kubectl rollout restart deployment/${serviceName}`,
        isDestructive: false,
        riskLevel: 'REQUIRES_APPROVAL',
      },
    ],
  };
}

/**
 * 6. VERIFY: Formulate pre-flight safety checks and post-remediation verification criteria.
 */
export function formulateVerificationCriteria(
  understanding: IncidentUnderstanding,
  _rca: RootCauseAnalysis,
  _plan: RemediationPlan,
): VerificationCriteria {
  const serviceName = understanding.serviceName || 'service';

  return {
    preExecutionSafetyChecks: [
      `Verify Kubernetes cluster node capacity before rolling restart of ${serviceName}.`,
      'Confirm database replica lag is under 1.0s.',
      'Ensure canary health check endpoints are responding.',
    ],
    postExecutionVerificationProbes: [
      {
        metricOrEndpoint: `http://${serviceName}/healthz`,
        expectedCondition: 'HTTP 200 OK with response latency < 150ms',
        timeoutSec: 60,
      },
      {
        metricOrEndpoint: 'datadog:http.5xx_error_rate',
        expectedCondition: '5xx error rate drops below 0.05%',
        timeoutSec: 120,
      },
    ],
  };
}

/**
 * 7. RESOLVE / ESCALATE: Determine autonomous readiness or compile structured escalation package.
 */
export function evaluateAutonomousReadiness(
  understanding: IncidentUnderstanding,
  rca: RootCauseAnalysis,
  plan: RemediationPlan,
  verify: VerificationCriteria,
): AutonomousReadiness {
  const isHighConfidence = rca.confidenceScore >= 0.75;
  const isSafeAction = plan.riskTier === 'SAFE_AUTOMATIC';
  const hasVerification = verify.postExecutionVerificationProbes.length > 0;

  if (isHighConfidence && isSafeAction && hasVerification) {
    return {
      isReady: true,
      blockers: [],
    };
  }

  const blockers: string[] = [];
  if (!isHighConfidence) blockers.push(`Confidence score (${Math.round(rca.confidenceScore * 100)}%) is below autonomous execution threshold (75%).`);
  if (!isSafeAction) blockers.push(`Remediation plan contains ${plan.riskTier} actions requiring human sign-off.`);

  return {
    isReady: false,
    blockers,
    escalationPackage: {
      summary: understanding.summary,
      investigationSummary: `Diagnosed for service "${understanding.serviceName || 'System'}" with ${understanding.detectedSymptoms.length} detected symptoms.`,
      evidenceSummary: rca.evidenceChain.map((e) => `${e.signal} (${e.source}): ${e.observation}`),
      candidateCauses: [rca.primaryRootCause, ...rca.contributingFactors],
      actionsConsidered: plan.actions.map((a) => `${a.actionType}: ${a.description}`),
      recommendedNextSteps: [
        'Review the proposed remediation plan actions.',
        'Approve execution or run remediation commands manually.',
        'Verify health probes after completion.',
      ],
    },
  };
}

/**
 * Complete Orchestration Pipeline: UNDERSTAND -> INVESTIGATE -> RETRIEVE -> REASON/RCA -> DECIDE/PLAN -> VERIFY -> RESOLVE/ESCALATE
 */
export function orchestrateIncidentReasoning(params: {
  incident: RawIncidentInput;
  historicalIncidents?: RawHistoricalIncident[];
  retrievedSops?: RawSopMatch[];
}): IncidentAnalysisResponse {
  const understand = understandIncident(params.incident);
  const investigate = investigateIncidentContext(params.incident, params.historicalIncidents);
  const retrieve = retrieveKnowledgeEvidence(params.retrievedSops);
  const reasonRca = reasonRootCause(understand, investigate, retrieve);
  const decidePlan = decideRemediationPlan(understand, reasonRca, retrieve);
  const verify = formulateVerificationCriteria(understand, reasonRca, decidePlan);
  const resolveEscalate = evaluateAutonomousReadiness(understand, reasonRca, decidePlan, verify);

  return {
    incidentId: params.incident.id,
    organizationId: params.incident.organizationId,
    understand,
    investigate,
    retrieve,
    reasonRca,
    decidePlan,
    verify,
    resolveEscalate,
    createdAt: new Date().toISOString(),
  };
}