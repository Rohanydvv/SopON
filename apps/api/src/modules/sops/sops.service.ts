import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { prisma } from '@sopon/database';
import {
  CreateDocumentRequest,
  DocumentDetailResponse,
  DocumentResponse,
  DocumentSourceType,
  ErrorCodes,
  RagSearchResultResponse,
  RecommendedSopResponse,
  UpdateDocumentRequest,
} from '@sopon/contracts';
import {
  cosineSimilarity,
  fetchWebpageContent,
  formatVectorForPg,
  generateEmbedding,
  generateEmbeddings,
  splitDocumentIntoChunks,
} from '@sopon/ai';

@Injectable()
export class SopsService {
  async createDocument(
    orgId: string,
    data: CreateDocumentRequest,
    actorUserId: string,
  ): Promise<DocumentDetailResponse> {
    if (data.serviceId) {
      const service = await prisma.service.findUnique({
        where: { id: data.serviceId },
      });
      if (!service || service.organizationId !== orgId) {
        throw new BadRequestException({
          code: ErrorCodes.VALIDATION_ERROR,
          message: 'Specified service does not belong to this organization',
        });
      }
    }

    let finalTitle = data.title ? data.title.trim() : '';
    let finalContent = data.content ? data.content.trim() : '';
    let targetUrl: string | null = data.sourceUrl ? data.sourceUrl.trim() : null;

    // Check if content itself is a URL or sourceType is URL
    if (
      data.sourceType === 'URL' ||
      targetUrl ||
      finalContent.startsWith('http://') ||
      finalContent.startsWith('https://')
    ) {
      if (!targetUrl && (finalContent.startsWith('http://') || finalContent.startsWith('https://'))) {
        targetUrl = finalContent;
      }

      if (targetUrl) {
        try {
          const fetched = await fetchWebpageContent(targetUrl);
          finalContent = fetched.content;
          if (!finalTitle && fetched.title) {
            finalTitle = fetched.title;
          }
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown network error';
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Failed to fetch external URL content: ${errMsg}`,
          });
        }
      }
    }

    if (!finalTitle) {
      finalTitle = targetUrl ? `Webpage: ${targetUrl}` : 'Untitled SOP Document';
    }

    if (!finalContent || finalContent.length < 5) {
      throw new BadRequestException({
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Document content could not be extracted or is empty',
      });
    }

    const doc = await prisma.knowledgeDocument.create({
      data: {
        organizationId: orgId,
        serviceId: data.serviceId || null,
        title: finalTitle,
        content: finalContent,
        sourceType: data.sourceType || (targetUrl ? 'URL' : 'RUNBOOK'),
        sourceUrl: targetUrl,
        tags: data.tags || [],
        version: 1,
      },
    });

    // Chunk document and generate vector embeddings across all extracted sections
    await this.indexDocumentChunks(doc.id, orgId, doc.content);

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: (actorUserId && actorUserId.length > 10 && actorUserId !== 'system') ? actorUserId : null,
        action: 'SOP_DOCUMENT_CREATE',
        entityType: 'KnowledgeDocument',
        entityId: doc.id,
        metadataJson: { title: doc.title, sourceType: doc.sourceType, sourceUrl: targetUrl },
      },
    });

    const chunkCount = await prisma.knowledgeChunk.count({
      where: { documentId: doc.id },
    });

    return this.mapToDetailResponse(doc, chunkCount);
  }

  async listDocuments(
    orgId: string,
    filters: {
      sourceType?: DocumentSourceType;
      serviceId?: string;
      search?: string;
    } = {},
  ): Promise<DocumentResponse[]> {
    const where: any = {
      organizationId: orgId,
    };

    if (filters.sourceType) {
      where.sourceType = filters.sourceType;
    }

    if (filters.serviceId) {
      where.serviceId = filters.serviceId;
    }

    if (filters.search) {
      where.OR = [
        { title: { contains: filters.search, mode: 'insensitive' } },
        { content: { contains: filters.search, mode: 'insensitive' } },
      ];
    }

    const docs = await prisma.knowledgeDocument.findMany({
      where,
      include: {
        _count: {
          select: { chunks: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return docs.map((d) => this.mapToResponse(d, d._count.chunks));
  }

  async getDocument(orgId: string, documentId: string): Promise<DocumentDetailResponse> {
    const doc = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });

    if (!doc || doc.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Knowledge document not found in this organization',
      });
    }

    const chunkCount = await prisma.knowledgeChunk.count({
      where: { documentId: doc.id },
    });

    return this.mapToDetailResponse(doc, chunkCount);
  }

  async updateDocument(
    orgId: string,
    documentId: string,
    data: UpdateDocumentRequest,
    actorUserId: string,
  ): Promise<DocumentDetailResponse> {
    const existing = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });

    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Knowledge document not found in this organization',
      });
    }

    const updateData: any = {};
    let shouldReindex = false;

    if (data.title && data.title !== existing.title) {
      updateData.title = data.title.trim();
    }

    if (data.sourceType && data.sourceType !== existing.sourceType) {
      updateData.sourceType = data.sourceType;
    }

    if (data.sourceUrl !== undefined) {
      updateData.sourceUrl = data.sourceUrl || null;
      if (
        data.sourceUrl &&
        data.sourceUrl !== existing.sourceUrl &&
        (data.sourceType === 'URL' || existing.sourceType === 'URL')
      ) {
        try {
          const fetched = await fetchWebpageContent(data.sourceUrl);
          updateData.content = fetched.content;
          shouldReindex = true;
        } catch (err: unknown) {
          const errMsg = err instanceof Error ? err.message : 'Unknown network error';
          throw new BadRequestException({
            code: ErrorCodes.VALIDATION_ERROR,
            message: `Failed to fetch external URL content: ${errMsg}`,
          });
        }
      }
    }

    if (data.serviceId !== undefined) {
      updateData.serviceId = data.serviceId || null;
    }

    if (data.tags !== undefined) {
      updateData.tags = data.tags;
    }

    if (data.content && data.content.trim() !== existing.content) {
      updateData.content = data.content.trim();
      updateData.version = existing.version + 1;
      shouldReindex = true;
    }

    const updated = await prisma.knowledgeDocument.update({
      where: { id: documentId },
      data: updateData,
    });

    if (shouldReindex) {
      // Clean existing chunks and re-index
      await prisma.knowledgeChunk.deleteMany({
        where: { documentId },
      });
      await this.indexDocumentChunks(documentId, orgId, updated.content);
    }

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: (actorUserId && actorUserId.length > 10 && actorUserId !== 'system') ? actorUserId : null,
        action: 'SOP_DOCUMENT_UPDATE',
        entityType: 'KnowledgeDocument',
        entityId: documentId,
        metadataJson: { updatedFields: data },
      },
    });

    const chunkCount = await prisma.knowledgeChunk.count({
      where: { documentId },
    });

    return this.mapToDetailResponse(updated, chunkCount);
  }

  async deleteDocument(
    orgId: string,
    documentId: string,
    actorUserId: string,
  ): Promise<{ success: boolean; message: string }> {
    const existing = await prisma.knowledgeDocument.findUnique({
      where: { id: documentId },
    });

    if (!existing || existing.organizationId !== orgId) {
      throw new NotFoundException({
        code: ErrorCodes.NOT_FOUND,
        message: 'Knowledge document not found in this organization',
      });
    }

    await prisma.knowledgeDocument.delete({
      where: { id: documentId },
    });

    await prisma.auditLog.create({
      data: {
        organizationId: orgId,
        actorUserId: (actorUserId && actorUserId.length > 10 && actorUserId !== 'system') ? actorUserId : null,
        action: 'SOP_DOCUMENT_DELETE',
        entityType: 'KnowledgeDocument',
        entityId: documentId,
      },
    });

    return { success: true, message: 'Knowledge document deleted successfully' };
  }

  async ragSearch(
    orgId: string,
    query: string,
    topK = 5,
    minScore = 0.15,
    serviceId?: string,
  ): Promise<RagSearchResultResponse[]> {
    const queryVector = await generateEmbedding(query);
    const formattedVector = formatVectorForPg(queryVector);

    try {
      // Attempt pgvector native distance operator
      let sql = `
        SELECT c.id as "chunkId", c."documentId", c.content, d.title as "documentTitle", d."sourceType",
               (1 - (c.embedding <=> '${formattedVector}'::vector)) as "similarityScore"
        FROM knowledge_chunks c
        JOIN knowledge_documents d ON d.id = c."documentId"
        WHERE c."organizationId" = '${orgId}'
          AND c.embedding IS NOT NULL
      `;

      if (serviceId) {
        sql += ` AND (d."serviceId" = '${serviceId}' OR d."serviceId" IS NULL)`;
      }

      sql += `
        ORDER BY c.embedding <=> '${formattedVector}'::vector ASC
        LIMIT ${topK};
      `;

      const rawResults = await prisma.$queryRawUnsafe<
        Array<{
          chunkId: string;
          documentId: string;
          content: string;
          documentTitle: string;
          sourceType: string;
          similarityScore: number | string;
        }>
      >(sql);

      if (rawResults && rawResults.length > 0) {
        const filtered = rawResults
          .map((r) => ({
            chunkId: r.chunkId,
            documentId: r.documentId,
            documentTitle: r.documentTitle,
            sourceType: r.sourceType as DocumentSourceType,
            content: r.content,
            similarityScore: Number(r.similarityScore) || 0,
          }))
          .filter((r) => r.similarityScore >= minScore);

        if (filtered.length > 0) {
          return filtered;
        }
      }
    } catch {
      // Fallback to in-memory vector matching
    }

    // In-memory fallback
    const chunks = await prisma.knowledgeChunk.findMany({
      where: {
        organizationId: orgId,
        ...(serviceId ? { document: { serviceId } } : {}),
      },
      include: {
        document: true,
      },
    });

    const scored = chunks.map((chunk) => {
      const metadata = (chunk.metadataJson as { vector?: number[] }) || {};
      const chunkVector = metadata.vector || [];
      const score = cosineSimilarity(queryVector, chunkVector);

      return {
        chunkId: chunk.id,
        documentId: chunk.documentId,
        documentTitle: chunk.document.title,
        sourceType: chunk.document.sourceType as DocumentSourceType,
        content: chunk.content,
        similarityScore: Math.max(0, score),
      };
    });

    scored.sort((a, b) => b.similarityScore - a.similarityScore);
    return scored.filter((s) => s.similarityScore >= minScore).slice(0, topK);
  }

  async getRecommendedSopsForIncident(
    orgId: string,
    incidentId: string,
  ): Promise<RecommendedSopResponse[]> {
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

    const searchQuery = `${incident.title} ${incident.description} ${incident.service?.name || ''}`;
    const searchResults = await this.ragSearch(
      orgId,
      searchQuery,
      6,
      0.15,
      incident.serviceId || undefined,
    );

    // Group chunks by document
    const docMap = new Map<string, RecommendedSopResponse>();

    for (const res of searchResults) {
      if (!docMap.has(res.documentId)) {
        const steps = this.extractRemediationSteps(res.content);
        docMap.set(res.documentId, {
          documentId: res.documentId,
          title: res.documentTitle,
          sourceType: res.sourceType,
          relevanceScore: Math.round(res.similarityScore * 100) / 100,
          matchedSnippet: res.content.slice(0, 300),
          remediationSteps: steps,
        });
      }
    }

    return Array.from(docMap.values());
  }

  private async indexDocumentChunks(documentId: string, orgId: string, content: string) {
    const chunks = splitDocumentIntoChunks(content);
    if (chunks.length === 0) return;

    const texts = chunks.map((c: { content: string }) => c.content);
    const vectors = await generateEmbeddings(texts);

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const vector = vectors[i];
      if (!chunk || !vector) continue;

      const createdChunk = await prisma.knowledgeChunk.create({
        data: {
          documentId,
          organizationId: orgId,
          chunkIndex: chunk.chunkIndex,
          tokenCount: chunk.tokenCount,
          content: chunk.content,
          metadataJson: { vector },
        },
      });

      // Try setting pgvector column if supported
      try {
        const formattedVector = formatVectorForPg(vector);
        await prisma.$executeRawUnsafe(
          `UPDATE knowledge_chunks SET embedding = '${formattedVector}'::vector WHERE id = '${createdChunk.id}';`,
        );
      } catch {
        // Safe to ignore in environments where pgvector extension isn't loaded
      }
    }
  }

  private extractRemediationSteps(content: string): string[] {
    const lines = content.split('\n');
    const steps: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      // Match ordered list "1. ...", checkbox "- [ ] ...", or unordered list "- ..."
      if (/^(\d+\.|\-|\*)\s+/.test(trimmed) && trimmed.length > 5) {
        steps.push(trimmed.replace(/^(\d+\.|\-|\*)\s+/, ''));
      }
    }

    return steps.slice(0, 6);
  }

  private mapToResponse(d: any, chunkCount?: number): DocumentResponse {
    return {
      id: d.id,
      organizationId: d.organizationId,
      title: d.title,
      sourceType: d.sourceType as DocumentSourceType,
      sourceUrl: d.sourceUrl,
      version: d.version,
      chunkCount: chunkCount ?? 0,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  private mapToDetailResponse(d: any, chunkCount?: number): DocumentDetailResponse {
    return {
      ...this.mapToResponse(d, chunkCount),
      content: d.content,
    };
  }
}