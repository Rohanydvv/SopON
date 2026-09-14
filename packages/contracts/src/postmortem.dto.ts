import { z } from 'zod';

export const PostmortemStatusSchema = z.enum([
  'DRAFT',
  'QUALITY_CHECKING',
  'NEEDS_REVIEW',
  'APPROVED',
  'INDEXED',
  'DEPRECATED',
  'REJECTED',
]);

export type PostmortemStatus = z.infer<typeof PostmortemStatusSchema>;

export const KnowledgeStatusSchema = z.enum([
  'ACTIVE',
  'DEPRECATED',
  'ARCHIVED',
]);

export type KnowledgeStatus = z.infer<typeof KnowledgeStatusSchema>;

export const QualityGateCheckSchema = z.object({
  checkNumber: z.number().int(),
  checkName: z.string(),
  passed: z.boolean(),
  reason: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type QualityGateCheck = z.infer<typeof QualityGateCheckSchema>;

export const PostmortemQualityResultSchema = z.object({
  passed: z.boolean(),
  qualityScore: z.number().min(0).max(1),
  checks: z.array(QualityGateCheckSchema),
  recommendation: z.enum(['AUTO_APPROVE', 'NEEDS_HUMAN_REVIEW', 'REJECT']),
  summary: z.string().optional(),
});

export type PostmortemQualityResult = z.infer<typeof PostmortemQualityResultSchema>;

export const GeneratePostmortemRequestSchema = z.object({
  incidentId: z.string().uuid().optional(),
  customNotes: z.string().max(2000).optional(),
});

export type GeneratePostmortemRequest = z.infer<typeof GeneratePostmortemRequestSchema>;

export const ReviewPostmortemRequestSchema = z.object({
  status: z.enum(['APPROVED', 'REJECTED', 'DEPRECATED']),
  reviewNotes: z.string().max(1000).optional(),
  autoIndex: z.boolean().optional().default(true),
});

export type ReviewPostmortemRequest = z.infer<typeof ReviewPostmortemRequestSchema>;

export const DeprecatePostmortemRequestSchema = z.object({
  reason: z.string().min(3).max(500),
});

export type DeprecatePostmortemRequest = z.infer<typeof DeprecatePostmortemRequestSchema>;

export const PostmortemResponseSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  incidentId: z.string().uuid(),
  serviceId: z.string().uuid().nullable().optional(),
  serviceName: z.string().nullable().optional(),
  title: z.string(),
  summary: z.string(),
  rootCause: z.string(),
  contributingFactors: z.array(z.string()),
  remediationAction: z.string(),
  remediationSteps: z.array(z.string()),
  preventionItems: z.array(z.string()),
  detectionTimeMinutes: z.number().nullable().optional(),
  resolutionTimeMinutes: z.number().nullable().optional(),
  status: PostmortemStatusSchema,
  qualityScore: z.number(),
  qualityDetails: PostmortemQualityResultSchema.optional(),
  isAuthoritative: z.boolean(),
  documentId: z.string().uuid().nullable().optional(),
  authorUserId: z.string().nullable().optional(),
  reviewedByUserId: z.string().nullable().optional(),
  reviewedAt: z.string().datetime().nullable().optional(),
  reviewNotes: z.string().nullable().optional(),
  deprecatedAt: z.string().datetime().nullable().optional(),
  deprecatedReason: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type PostmortemResponse = z.infer<typeof PostmortemResponseSchema>;

export const PostmortemListQuerySchema = z.object({
  status: PostmortemStatusSchema.optional(),
  serviceId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20).optional(),
});

export type PostmortemListQuery = z.infer<typeof PostmortemListQuerySchema>;
