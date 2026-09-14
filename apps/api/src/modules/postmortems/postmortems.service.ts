import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  ErrorCodes,
  PostmortemListQuery,
  PostmortemResponse,
  PostmortemStatus,
  ReviewPostmortemRequest,
} from '@sopon/contracts';
import { PostmortemQualityGateService } from './postmortem-quality-gate.service';
import { PostmortemGeneratorService } from './postmortem-generator.service';
import { SopsService } from '../sops/sops.service';

@Injectable()
export class PostmortemsService {
  constructor(
    private readonly qualityGateService: PostmortemQualityGateService,
    private readonly generatorService: PostmortemGeneratorService,
    private readonly sopsService: SopsService,
  ) {}

  /**
   * Generates or regenerates postmortem, evaluates 8-point quality gate, and auto-indexes if policy allows
   */
  async generatePostmortem(
    orgId: string,
    incidentId: string,
    actorUserId?: string,
    customNotes?: string,
  ): Promise<PostmortemResponse> {
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

    // 1. Synthesize postmortem content
    const content = await this.generatorService.generateContent(orgId, incidentId, customNotes);

    // 2. Evaluate 8-point deterministic quality gate
    const qualityResult = await this.qualityGateService.evaluateGate(orgId, incidentId);

    // 3. Check Organization Remediation Policy
    const policy = await prisma.organizationRemediationPolicy.findUnique({
      where: { organizationId: orgId },
    });
    const autoIndex = policy?.autoIndexVerifiedPostmortems ?? true;

    // Determine target initial status
    let status: PostmortemStatus = 'DRAFT';
    let isAuthoritative = false;

    if (qualityResult.passed && autoIndex) {
      status = 'APPROVED';
      isAuthoritative = true;
    } else if (qualityResult.passed) {
      status = 'NEEDS_REVIEW';
      isAuthoritative = false;
    } else if (qualityResult.recommendation === 'REJECT') {
      status = 'REJECTED';
      isAuthoritative = false;
    } else {
      status = 'NEEDS_REVIEW';
      isAuthoritative = false;
    }

    // Validate actor
    let validActorId: string | null = null;
    if (actorUserId && actorUserId.length > 20) {
      const userExists = await prisma.user.findUnique({ where: { id: actorUserId } });
      if (userExists) validActorId = userExists.id;
    }

    // Upsert postmortem
    const postmortem = await prisma.postmortem.upsert({
      where: { incidentId },
      create: {
        organizationId: orgId,
        incidentId,
        serviceId: incident.serviceId,
        title: content.title,
        summary: content.summary,
        rootCause: content.rootCause,
        contributingFactors: content.contributingFactors,
        remediationAction: content.remediationAction,
        remediationSteps: content.remediationSteps,
        preventionItems: content.preventionItems,
        detectionTimeMinutes: content.detectionTimeMinutes,
        resolutionTimeMinutes: content.resolutionTimeMinutes,
        status,
        qualityScore: qualityResult.qualityScore,
        qualityDetailsJson: qualityResult as any,
        isAuthoritative,
        authorUserId: validActorId,
      },
      update: {
        title: content.title,
        summary: content.summary,
        rootCause: content.rootCause,
        contributingFactors: content.contributingFactors,
        remediationAction: content.remediationAction,
        remediationSteps: content.remediationSteps,
        preventionItems: content.preventionItems,
        detectionTimeMinutes: content.detectionTimeMinutes,
        resolutionTimeMinutes: content.resolutionTimeMinutes,
        status,
        qualityScore: qualityResult.qualityScore,
        qualityDetailsJson: qualityResult as any,
        isAuthoritative,
      },
      include: {
        service: true,
      },
    });

    // 4. If APPROVED & Auto-index enabled, index into pgvector as KnowledgeDocument
    if (status === 'APPROVED') {
      await this.indexPostmortemToKnowledge(orgId, postmortem.id);
    }

    // 5. Add timeline event and audit log
    await prisma.incidentTimeline.create({
      data: {
        incidentId,
        eventType: 'POSTMORTEM_GENERATED',
        message: `Postmortem generated with ${Math.round(qualityResult.qualityScore * 100)}% quality score. Status: ${status}.`,
        metadataJson: { postmortemId: postmortem.id, qualityResult } as any,
        actorUserId: validActorId,
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: validActorId,
        action: 'POSTMORTEM_GENERATED',
        entityType: 'Postmortem',
        entityId: postmortem.id,
        metadataJson: { incidentId, status, qualityScore: qualityResult.qualityScore },
      },
    });

    return this.getPostmortemById(orgId, postmortem.id);
  }

  /**
   * Reviews and promotes / rejects a postmortem (RBAC: OWNER, ADMIN, MANAGER)
   */
  async reviewPostmortem(
    orgId: string,
    postmortemId: string,
    actorUserId: string,
    request: ReviewPostmortemRequest,
  ): Promise<PostmortemResponse> {
    const postmortem = await prisma.postmortem.findUnique({
      where: { id: postmortemId },
      include: { service: true },
    });

    if (!postmortem || postmortem.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Postmortem not found in this organization',
      });
    }

    await this.validateReviewerRole(orgId, actorUserId);

    const now = new Date();

    if (request.status === 'APPROVED') {
      await prisma.postmortem.update({
        where: { id: postmortemId },
        data: {
          status: 'APPROVED',
          isAuthoritative: true,
          reviewedByUserId: actorUserId,
          reviewedAt: now,
          reviewNotes: request.reviewNotes,
        },
      });

      if (request.autoIndex !== false) {
        await this.indexPostmortemToKnowledge(orgId, postmortemId);
      }
    } else if (request.status === 'REJECTED') {
      await prisma.postmortem.update({
        where: { id: postmortemId },
        data: {
          status: 'REJECTED',
          isAuthoritative: false,
          reviewedByUserId: actorUserId,
          reviewedAt: now,
          reviewNotes: request.reviewNotes,
        },
      });

      // If previously had a linked document, deprecate it
      if (postmortem.documentId) {
        await prisma.knowledgeDocument.update({
          where: { id: postmortem.documentId },
          data: {
            status: 'DEPRECATED',
            isAuthoritative: false,
            deprecationReason: request.reviewNotes || 'Postmortem rejected by reviewer',
          },
        });
      }
    } else if (request.status === 'DEPRECATED') {
      return this.deprecatePostmortem(
        orgId,
        postmortemId,
        actorUserId,
        request.reviewNotes || 'Manually deprecated during review',
      );
    }

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'POSTMORTEM_REVIEWED',
        entityType: 'Postmortem',
        entityId: postmortemId,
        metadataJson: { newStatus: request.status, reviewNotes: request.reviewNotes },
      },
    });

    return this.getPostmortemById(orgId, postmortemId);
  }

  /**
   * Deprecates postmortem and linked knowledge document
   */
  async deprecatePostmortem(
    orgId: string,
    postmortemId: string,
    actorUserId: string,
    reason: string,
  ): Promise<PostmortemResponse> {
    const postmortem = await prisma.postmortem.findUnique({
      where: { id: postmortemId },
    });

    if (!postmortem || postmortem.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Postmortem not found in this organization',
      });
    }

    await this.validateReviewerRole(orgId, actorUserId);

    const now = new Date();

    const updated = await prisma.postmortem.update({
      where: { id: postmortemId },
      data: {
        status: 'DEPRECATED',
        isAuthoritative: false,
        deprecatedAt: now,
        deprecatedReason: reason,
      },
      include: { service: true },
    });

    if (postmortem.documentId) {
      await prisma.knowledgeDocument.update({
        where: { id: postmortem.documentId },
        data: {
          status: 'DEPRECATED',
          isAuthoritative: false,
          deprecationReason: reason,
        },
      });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId,
        action: 'POSTMORTEM_DEPRECATED',
        entityType: 'Postmortem',
        entityId: postmortemId,
        metadataJson: { reason, documentId: postmortem.documentId },
      },
    });

    return this.mapToResponse(updated);
  }

  /**
   * Indexes an approved postmortem as a KnowledgeDocument and chunks in pgvector
   */
  async indexPostmortemToKnowledge(orgId: string, postmortemId: string): Promise<string> {
    const postmortem = await prisma.postmortem.findUnique({
      where: { id: postmortemId },
      include: { service: true },
    });

    if (!postmortem || postmortem.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Postmortem not found in this organization',
      });
    }

    // Format markdown runbook content
    const tags = ['postmortem', 'incident-learning', postmortem.remediationAction.toLowerCase()];
    if (postmortem.service?.slug) tags.push(postmortem.service.slug);

    const runbookContent = `
# Operational Postmortem Runbook: ${postmortem.title}

## Summary & Impact
${postmortem.summary}

## Diagnostic Symptoms & Root Cause
- **Root Cause**: ${postmortem.rootCause}
- **Contributing Factors**:
${postmortem.contributingFactors.map((f) => `  - ${f}`).join('\n')}

## Verified Remediation Procedure (${postmortem.remediationAction})
${postmortem.remediationSteps.map((s) => `${s}`).join('\n')}

## Prevention & Hardening
${postmortem.preventionItems.map((p) => `- [ ] ${p}`).join('\n')}
    `.trim();

    let doc;
    if (postmortem.documentId) {
      doc = await prisma.knowledgeDocument.update({
        where: { id: postmortem.documentId },
        data: {
          title: postmortem.title,
          content: runbookContent,
          status: 'ACTIVE',
          isAuthoritative: true,
          qualityScore: postmortem.qualityScore,
          tags,
        },
      });
    } else {
      doc = await prisma.knowledgeDocument.create({
        data: {
          organizationId: orgId,
          serviceId: postmortem.serviceId,
          title: postmortem.title,
          content: runbookContent,
          sourceType: 'POSTMORTEM',
          status: 'ACTIVE',
          isAuthoritative: true,
          incidentId: postmortem.incidentId,
          qualityScore: postmortem.qualityScore,
          tags,
          version: 1,
        },
      });
    }

    // Delete existing chunks if updating
    await prisma.knowledgeChunk.deleteMany({
      where: { documentId: doc.id },
    });

    // Chunk and index into pgvector
    await this.sopsService.indexDocumentChunksPublic(doc.id, orgId, runbookContent);

    // Update postmortem document linkage & status
    await prisma.postmortem.update({
      where: { id: postmortemId },
      data: {
        documentId: doc.id,
        status: 'INDEXED',
        isAuthoritative: true,
      },
    });

    return doc.id;
  }

  /**
   * Retrieves single postmortem by ID
   */
  async getPostmortemById(orgId: string, postmortemId: string): Promise<PostmortemResponse> {
    const postmortem = await prisma.postmortem.findUnique({
      where: { id: postmortemId },
      include: { service: true },
    });

    if (!postmortem || postmortem.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Postmortem not found in this organization',
      });
    }

    return this.mapToResponse(postmortem);
  }

  /**
   * Retrieves postmortem for an incident
   */
  async getPostmortemByIncidentId(orgId: string, incidentId: string): Promise<PostmortemResponse> {
    const postmortem = await prisma.postmortem.findUnique({
      where: { incidentId },
      include: { service: true },
    });

    if (!postmortem || postmortem.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Postmortem not found for this incident',
      });
    }

    return this.mapToResponse(postmortem);
  }

  /**
   * Lists postmortems with filters
   */
  async listPostmortems(orgId: string, query: PostmortemListQuery): Promise<PostmortemResponse[]> {
    const postmortems = await prisma.postmortem.findMany({
      where: {
        organizationId: orgId,
        ...(query.status ? { status: query.status } : {}),
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      },
      include: { service: true },
      orderBy: { createdAt: 'desc' },
      skip: ((query.page || 1) - 1) * (query.limit || 20),
      take: query.limit || 20,
    });

    return postmortems.map((p) => this.mapToResponse(p));
  }

  private async validateReviewerRole(orgId: string, userId: string) {
    if (!userId || typeof userId !== 'string') {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Valid reviewer identity required',
      });
    }

    const member = await prisma.membership.findFirst({
      where: {
        organizationId: orgId,
        userId,
        role: { in: ['OWNER', 'ADMIN', 'MANAGER'] },
      },
    });

    if (!member) {
      throw new ForbiddenException({
        code: ErrorCodes.FORBIDDEN,
        message: 'Only Organization Owners, Admins, and Managers can review or deprecate postmortems',
      });
    }
  }

  private mapToResponse(p: any): PostmortemResponse {
    return {
      id: p.id,
      organizationId: p.organizationId,
      incidentId: p.incidentId,
      serviceId: p.serviceId,
      serviceName: p.service?.name || null,
      title: p.title,
      summary: p.summary,
      rootCause: p.rootCause,
      contributingFactors: p.contributingFactors || [],
      remediationAction: p.remediationAction,
      remediationSteps: p.remediationSteps || [],
      preventionItems: p.preventionItems || [],
      detectionTimeMinutes: p.detectionTimeMinutes,
      resolutionTimeMinutes: p.resolutionTimeMinutes,
      status: p.status as PostmortemStatus,
      qualityScore: p.qualityScore,
      qualityDetails: p.qualityDetailsJson as any,
      isAuthoritative: p.isAuthoritative,
      documentId: p.documentId,
      authorUserId: p.authorUserId,
      reviewedByUserId: p.reviewedByUserId,
      reviewedAt: p.reviewedAt ? p.reviewedAt.toISOString() : null,
      reviewNotes: p.reviewNotes,
      deprecatedAt: p.deprecatedAt ? p.deprecatedAt.toISOString() : null,
      deprecatedReason: p.deprecatedReason,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    };
  }
}
