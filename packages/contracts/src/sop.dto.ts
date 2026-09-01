import { z } from 'zod';

export const DocumentSourceTypeSchema = z.enum([
  'DOCUMENT',
  'RUNBOOK',
  'POSTMORTEM',
  'URL',
]);

export type DocumentSourceType = z.infer<typeof DocumentSourceTypeSchema>;

export const CreateDocumentRequestSchema = z
  .object({
    title: z.string().min(2, 'Title must be at least 2 characters').max(255),
    content: z.string().optional(),
    sourceType: DocumentSourceTypeSchema.default('RUNBOOK'),
    sourceUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
    serviceId: z.string().uuid().optional().or(z.literal('')),
    tags: z.array(z.string()).optional(),
  })
  .refine(
    (data) => {
      if (data.sourceType === 'URL') {
        return (
          (typeof data.sourceUrl === 'string' && data.sourceUrl.length > 0) ||
          (typeof data.content === 'string' &&
            (data.content.startsWith('http://') || data.content.startsWith('https://')))
        );
      }
      return typeof data.content === 'string' && data.content.trim().length >= 10;
    },
    {
      message: 'Either valid content (at least 10 characters) or a valid URL must be provided',
      path: ['content'],
    },
  );

export type CreateDocumentRequest = z.infer<typeof CreateDocumentRequestSchema>;

export const UpdateDocumentRequestSchema = z.object({
  title: z.string().min(2).max(255).optional(),
  content: z.string().optional(),
  sourceType: DocumentSourceTypeSchema.optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
  serviceId: z.string().uuid().optional().nullable(),
  tags: z.array(z.string()).optional(),
});

export type UpdateDocumentRequest = z.infer<typeof UpdateDocumentRequestSchema>;

export interface DocumentResponse {
  id: string;
  organizationId: string;
  title: string;
  sourceType: DocumentSourceType;
  sourceUrl?: string | null;
  version: number;
  chunkCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentDetailResponse extends DocumentResponse {
  content: string;
}

export const RagSearchRequestSchema = z.object({
  query: z.string().min(2, 'Query must be at least 2 characters'),
  topK: z.number().int().min(1).max(20).default(5),
  minScore: z.number().min(0).max(1).default(0.15),
  serviceId: z.string().uuid().optional().or(z.literal('')),
});

export type RagSearchRequest = z.infer<typeof RagSearchRequestSchema>;

export interface RagSearchResultResponse {
  documentId: string;
  documentTitle: string;
  sourceType: DocumentSourceType;
  chunkId: string;
  content: string;
  similarityScore: number;
}

export interface RecommendedSopResponse {
  documentId: string;
  title: string;
  sourceType: DocumentSourceType;
  relevanceScore: number;
  matchedSnippet: string;
  remediationSteps: string[];
}