import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import {
  AuthSessionUser,
  CreateDocumentRequest,
  CreateDocumentRequestSchema,
  DocumentDetailResponse,
  DocumentResponse,
  DocumentSourceType,
  RagSearchRequest,
  RagSearchRequestSchema,
  RagSearchResultResponse,
  RecommendedSopResponse,
  UpdateDocumentRequest,
  UpdateDocumentRequestSchema,
  UserRole,
} from '@sopon/contracts';
import { SopsService } from './sops.service';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@ApiTags('SOP Knowledge Base & RAG')
@Controller('v1/organizations/:orgId')
@UseGuards(JwtAuthGuard, TenantGuard)
@ApiBearerAuth()
export class SopsController {
  constructor(private readonly sopsService: SopsService) {}

  @Post('documents')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER)
  @ApiOperation({ summary: 'Create and vector-index a new SOP/Runbook document' })
  async createDocument(
    @Param('orgId') orgId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(CreateDocumentRequestSchema)) body: CreateDocumentRequest,
  ): Promise<DocumentDetailResponse> {
    return this.sopsService.createDocument(orgId, body, user.id);
  }

  @Get('documents')
  @ApiOperation({ summary: 'List knowledge base documents' })
  @ApiQuery({ name: 'sourceType', required: false, enum: ['DOCUMENT', 'RUNBOOK', 'POSTMORTEM', 'URL'] })
  @ApiQuery({ name: 'serviceId', required: false, type: String })
  @ApiQuery({ name: 'search', required: false, type: String })
  async listDocuments(
    @Param('orgId') orgId: string,
    @Query('sourceType') sourceType?: DocumentSourceType,
    @Query('serviceId') serviceId?: string,
    @Query('search') search?: string,
  ): Promise<DocumentResponse[]> {
    return this.sopsService.listDocuments(orgId, {
      sourceType,
      serviceId,
      search,
    });
  }

  @Get('documents/:documentId')
  @ApiOperation({ summary: 'Get full SOP document content and chunk count' })
  async getDocument(
    @Param('orgId') orgId: string,
    @Param('documentId') documentId: string,
  ): Promise<DocumentDetailResponse> {
    return this.sopsService.getDocument(orgId, documentId);
  }

  @Patch('documents/:documentId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN, UserRole.MANAGER, UserRole.ENGINEER)
  @ApiOperation({ summary: 'Update SOP document content and re-index vector embeddings' })
  async updateDocument(
    @Param('orgId') orgId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthSessionUser,
    @Body(new ZodValidationPipe(UpdateDocumentRequestSchema)) body: UpdateDocumentRequest,
  ): Promise<DocumentDetailResponse> {
    return this.sopsService.updateDocument(orgId, documentId, body, user.id);
  }

  @Delete('documents/:documentId')
  @UseGuards(RolesGuard)
  @Roles(UserRole.OWNER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Delete SOP document and all associated vector chunks' })
  async deleteDocument(
    @Param('orgId') orgId: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: AuthSessionUser,
  ) {
    return this.sopsService.deleteDocument(orgId, documentId, user.id);
  }

  @Post('rag/search')
  @ApiOperation({ summary: 'Perform semantic RAG vector search across SOP chunks' })
  async ragSearch(
    @Param('orgId') orgId: string,
    @Body(new ZodValidationPipe(RagSearchRequestSchema)) body: RagSearchRequest,
  ): Promise<RagSearchResultResponse[]> {
    return this.sopsService.ragSearch(
      orgId,
      body.query,
      body.topK,
      body.minScore,
      body.serviceId,
    );
  }

  @Get('incidents/:incidentId/recommended-sops')
  @ApiOperation({ summary: 'Auto-match relevant SOP runbooks and remediation steps for an incident' })
  async getRecommendedSops(
    @Param('orgId') orgId: string,
    @Param('incidentId') incidentId: string,
  ): Promise<RecommendedSopResponse[]> {
    return this.sopsService.getRecommendedSopsForIncident(orgId, incidentId);
  }
}