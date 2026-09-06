import {
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  ErrorCodes,
  IncidentAnalysisResponse,
} from '@sopon/contracts';
import {
  orchestrateIncidentReasoning,
  RawHistoricalIncident,
  RawIncidentInput,
  RawSopMatch,
} from '@sopon/ai';
import { SopsService } from '../sops/sops.service';

@Injectable()
export class CopilotService {
  constructor(private readonly sopsService: SopsService) {}

  async analyzeIncident(
    orgId: string,
    incidentId: string,
    actorUserId?: string,
  ): Promise<IncidentAnalysisResponse> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
      include: { service: true },
    });

    if (!incident || incident.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.INCIDENT_NOT_FOUND,
        message: 'Incident not found in this organization',
      });
    }

    // 1. Gather historical incidents for investigation context
    const pastIncidents = await prisma.incident.findMany({
      where: {
        organizationId: orgId,
        id: { not: incidentId },
        ...(incident.serviceId ? { serviceId: incident.serviceId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const historicalIncidents: RawHistoricalIncident[] = pastIncidents.map((p) => ({
      id: p.id,
      title: p.title,
      status: p.status,
      resolvedAt: p.resolvedAt ? p.resolvedAt.toISOString() : null,
    }));

    // 2. Retrieve matched knowledge base SOPs and runbooks via RAG
    const recommendedSops = await this.sopsService.getRecommendedSopsForIncident(
      orgId,
      incidentId,
    );

    const retrievedSops: RawSopMatch[] = recommendedSops.map((s) => ({
      documentId: s.documentId,
      title: s.title,
      sourceType: s.sourceType,
      relevanceScore: s.relevanceScore,
      matchedSnippet: s.matchedSnippet,
      remediationSteps: s.remediationSteps,
    }));

    const rawInput: RawIncidentInput = {
      id: incident.id,
      organizationId: incident.organizationId,
      title: incident.title,
      description: incident.description,
      severity: incident.severity as any,
      serviceId: incident.serviceId,
      serviceName: incident.service?.name || null,
      serviceTier: incident.service?.tier || null,
      serviceEnvironment: incident.service?.environment || null,
      createdAt: incident.createdAt.toISOString(),
    };

    // 3. Orchestrate 7-Stage Autonomous Reasoning Engine
    const analysis = orchestrateIncidentReasoning({
      incident: rawInput,
      historicalIncidents,
      retrievedSops,
    });

    // 4. Record investigation event on the incident timeline
    await prisma.incidentTimeline.create({
      data: {
        incidentId,
        eventType: 'INVESTIGATION_NOTE',
        message: `Autonomous AI Investigation completed. Primary Root Cause: ${analysis.reasonRca.primaryRootCause} (Confidence: ${Math.round(analysis.reasonRca.confidenceScore * 100)}%). Risk Tier: ${analysis.decidePlan.riskTier}.`,
        metadataJson: analysis as any,
        actorUserId: (actorUserId && actorUserId.length > 10 && actorUserId !== 'system') ? actorUserId : null,
      },
    });

    // 5. Audit log
    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: (actorUserId && actorUserId.length > 10 && actorUserId !== 'system') ? actorUserId : null,
        action: 'AI_INCIDENT_ANALYSIS_COMPLETED',
        entityType: 'Incident',
        entityId: incidentId,
        metadataJson: {
          primaryRootCause: analysis.reasonRca.primaryRootCause,
          confidenceScore: analysis.reasonRca.confidenceScore,
          riskTier: analysis.decidePlan.riskTier,
          isReady: analysis.resolveEscalate.isReady,
        },
      },
    });

    return analysis;
  }

  async getIncidentAnalysis(
    orgId: string,
    incidentId: string,
  ): Promise<IncidentAnalysisResponse> {
    const incident = await prisma.incident.findUnique({
      where: { id: incidentId },
    });

    if (!incident || incident.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.INCIDENT_NOT_FOUND,
        message: 'Incident not found in this organization',
      });
    }

    // Check if an analysis event exists in timeline
    const latestEvent = await prisma.incidentTimeline.findFirst({
      where: {
        incidentId,
        eventType: 'INVESTIGATION_NOTE',
      },
      orderBy: { createdAt: 'desc' },
    });

    if (latestEvent && latestEvent.metadataJson && (latestEvent.metadataJson as any).understand) {
      return latestEvent.metadataJson as unknown as IncidentAnalysisResponse;
    }

    // Otherwise generate fresh analysis
    return this.analyzeIncident(orgId, incidentId);
  }
}