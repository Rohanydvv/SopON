'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  CreateDocumentRequest,
  DocumentResponse,
  DocumentSourceType,
  RagSearchResultResponse,
  ServiceResponse,
  UserRole,
} from '@sopon/contracts';
import {
  BookOpen,
  Plus,
  Search,
  Sparkles,
  FileText,
  Trash2,
  Loader2,
  X,
  AlertCircle,
  ArrowRight,
  Layers,
  Globe,
  CheckCircle2,
  ExternalLink,
} from 'lucide-react';

export default function SopsPage() {
  const { activeOrg, token } = useAuth();
  const [documents, setDocuments] = useState<DocumentResponse[]>([]);
  const [services, setServices] = useState<ServiceResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // Semantic RAG Tester State
  const [ragQuery, setRagQuery] = useState('');
  const [ragResults, setRagResults] = useState<RagSearchResultResponse[] | null>(null);
  const [isSearchingRag, setIsSearchingRag] = useState(false);

  // Create SOP Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<DocumentSourceType>('RUNBOOK');
  const [sourceUrl, setSourceUrl] = useState('');
  const [serviceId, setServiceId] = useState('');
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = async () => {
    if (!activeOrg || !token) return;
    setIsLoading(true);
    setError(null);

    try {
      const [docsRes, servicesRes] = await Promise.all([
        fetchApi<DocumentResponse[]>(
          `/v1/organizations/${activeOrg.organizationId}/documents`,
          {},
          token,
        ),
        fetchApi<ServiceResponse[]>(
          `/v1/organizations/${activeOrg.organizationId}/services`,
          {},
          token,
        ),
      ]);

      setDocuments(docsRes.data);
      setServices(servicesRes.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String(err.message));
      } else {
        setError('Failed to load knowledge documents');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeOrg?.organizationId, token]);

  const handleCreateDocument = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !token) return;
    setModalError(null);
    setIsSubmitting(true);

    try {
      const payload: CreateDocumentRequest = {
        title: title.trim(),
        sourceType,
        sourceUrl: sourceType === 'URL' ? sourceUrl.trim() : undefined,
        serviceId: serviceId || undefined,
        content: sourceType === 'URL' ? (content.trim() || undefined) : content.trim(),
      };

      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/documents`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        token,
      );

      setIsCreateModalOpen(false);
      setTitle('');
      setSourceUrl('');
      setContent('');
      setServiceId('');
      await loadData();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setModalError(String(err.message));
      } else {
        setModalError('Failed to create SOP document');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRagSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !token || !ragQuery.trim()) return;
    setIsSearchingRag(true);

    try {
      const res = await fetchApi<RagSearchResultResponse[]>(
        `/v1/organizations/${activeOrg.organizationId}/rag/search`,
        {
          method: 'POST',
          body: JSON.stringify({
            query: ragQuery.trim(),
            topK: 4,
          }),
        },
        token,
      );

      setRagResults(res.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    } finally {
      setIsSearchingRag(false);
    }
  };

  const handleDeleteDocument = async (docId: string, docTitle: string) => {
    if (!activeOrg || !token) return;
    if (!confirm(`Are you sure you want to delete "${docTitle}" and its vector chunks?`)) {
      return;
    }

    try {
      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/documents/${docId}`,
        { method: 'DELETE' },
        token,
      );
      await loadData();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    }
  };

  const insertTemplate = () => {
    setContent(`# ${title || 'Service Remediation Runbook'}

## Overview
Describe the purpose of this SOP and the architecture components involved.

## Diagnostic Symptoms
- Metric spikes (e.g. CPU > 90%, Latency p99 > 500ms)
- Error logs or HTTP 5xx codes

## Remediation Steps
1. Verify system telemetry and active connections
2. Inspect worker logs with \`kubectl logs -l app=service-name\`
3. Scale deployment or increase connection pool parameters
4. Restart affected pods gracefully
5. Verify error rate returns to normal baseline
`);
  };

  const filteredDocs = documents.filter((doc) => {
    if (selectedType !== 'ALL' && doc.sourceType !== selectedType) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return doc.title.toLowerCase().includes(q);
    }
    return true;
  });

  const canManage = activeOrg?.role !== UserRole.VIEWER;
  const isOwnerOrAdmin = activeOrg?.role === UserRole.OWNER || activeOrg?.role === UserRole.ADMIN;

  const sourceTypeBadge = (type: DocumentSourceType) => {
    const styles: Record<DocumentSourceType, string> = {
      RUNBOOK: 'bg-indigo-500/15 text-indigo-400 border-indigo-500/30',
      POSTMORTEM: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
      DOCUMENT: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
      URL: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
    };

    return (
      <span className={`px-2 py-0.5 rounded text-xs uppercase font-mono border ${styles[type]}`}>
        {type}
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <BookOpen className="h-6 w-6 text-indigo-400" />
            SOPs & Runbook Knowledge Base
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Centralized operational runbooks, external docs, and pgvector semantic retrieval for {activeOrg?.organizationName}.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Plus className="h-4 w-4" />
            Create SOP / Ingest URL
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Semantic RAG Vector Search Tester */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-indigo-400" />
          <h2 className="text-base font-bold text-white">Semantic RAG Vector Search</h2>
          <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded font-mono">
            pgvector 1536-dim
          </span>
        </div>
        <p className="text-xs text-slate-400">
          Test similarity matching across all chunked SOPs and external documentation in your organization. Query natural language incident symptoms or errors.
        </p>

        <form onSubmit={handleRagSearch} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3.5 top-3 text-slate-500" />
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              placeholder="e.g. connection pooling multiplexing Redis or connection timeout..."
              className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <button
            type="submit"
            disabled={isSearchingRag || !ragQuery.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {isSearchingRag ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Search Vector Index
          </button>
        </form>

        {/* RAG Results Preview */}
        {ragResults && (
          <div className="mt-4 pt-4 border-t border-slate-800 space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>Matching Chunks Found: {ragResults.length}</span>
              <button
                onClick={() => setRagResults(null)}
                className="text-slate-500 hover:text-white"
              >
                Clear Results
              </button>
            </div>

            {ragResults.length === 0 ? (
              <div className="text-center py-4 text-xs text-slate-500">
                No matching SOP chunks found with sufficient similarity.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {ragResults.map((r) => (
                  <Link
                    key={r.chunkId}
                    href={`/app/sops/${r.documentId}`}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 hover:border-indigo-500/40 transition-all space-y-2 group"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white group-hover:text-indigo-400">
                        {r.documentTitle}
                      </span>
                      <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-bold">
                        {Math.round(r.similarityScore * 100)}% Match
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 line-clamp-3 leading-relaxed font-mono">
                      {r.content}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Document Types</option>
            <option value="RUNBOOK">Runbooks</option>
            <option value="POSTMORTEM">Postmortems</option>
            <option value="DOCUMENT">Standard Documents</option>
            <option value="URL">External URL</option>
          </select>
        </div>

        <div className="relative w-full md:w-72">
          <Search className="h-4 w-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter documents..."
            className="w-full pl-9 pr-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Documents Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-12 flex justify-center items-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <BookOpen className="h-10 w-10 text-slate-600 mx-auto" />
            <div className="font-semibold text-white">No knowledge documents found</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Create an operational runbook or ingest documentation from external URLs.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {filteredDocs.map((doc) => (
              <div
                key={doc.id}
                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/30 transition-colors group"
              >
                <Link
                  href={`/app/sops/${doc.id}`}
                  className="space-y-1.5 flex-1 block"
                >
                  <div className="flex items-center gap-2.5">
                    {sourceTypeBadge(doc.sourceType)}
                    <span className="font-bold text-white text-base group-hover:text-indigo-400 transition-colors">
                      {doc.title}
                    </span>
                    {doc.sourceUrl && (
                      <span className="text-xs text-slate-500 font-mono flex items-center gap-1">
                        <Globe className="h-3 w-3" /> {doc.sourceUrl}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-4 text-xs text-slate-400">
                    <span className="flex items-center gap-1 font-mono">
                      <Layers className="h-3.5 w-3.5 text-indigo-400" />
                      {doc.chunkCount ?? 1} Chunks
                    </span>
                    <span>v{doc.version}</span>
                    <span>Updated {new Date(doc.updatedAt).toLocaleDateString()}</span>
                  </div>
                </Link>

                <div className="flex items-center gap-3 shrink-0">
                  <Link
                    href={`/app/sops/${doc.id}`}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors flex items-center gap-1"
                  >
                    View <ArrowRight className="h-3 w-3" />
                  </Link>

                  {isOwnerOrAdmin && (
                    <button
                      onClick={() => handleDeleteDocument(doc.id, doc.title)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Document"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create SOP Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsCreateModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-indigo-400" />
              {sourceType === 'URL' ? 'Ingest External Documentation URL' : 'Create SOP / Runbook'}
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              {sourceType === 'URL'
                ? 'Provide an external documentation URL. SopON will fetch the webpage, extract clean text, chunk into 500-token sections, and generate vector embeddings.'
                : 'Write standard operating procedures. SopON will automatically chunk and generate 1536-dim vector embeddings.'}
            </p>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateDocument} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Source Type
                  </label>
                  <select
                    value={sourceType}
                    onChange={(e) => setSourceType(e.target.value as DocumentSourceType)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="RUNBOOK">Runbook</option>
                    <option value="URL">External URL (Webpage Ingestion)</option>
                    <option value="POSTMORTEM">Postmortem</option>
                    <option value="DOCUMENT">Standard Document</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Target Service (Optional)
                  </label>
                  <select
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Organization Wide --</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.environment})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {sourceType === 'URL' ? (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Webpage URL <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <Globe className="h-4 w-4 absolute left-3.5 top-3 text-slate-500" />
                      <input
                        type="url"
                        required
                        value={sourceUrl}
                        onChange={(e) => setSourceUrl(e.target.value)}
                        placeholder="https://redis.io/docs/latest/develop/clients/pools-and-muxing/"
                        className="w-full pl-10 pr-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Document Title (Optional - auto-extracted from webpage)
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Redis Connection Pooling Documentation"
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="p-4 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 text-xs flex items-start gap-2.5">
                    <Sparkles className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                    <span>
                      SopON will fetch the live URL, strip navigation and scripts, extract documentation text and code blocks, slice into semantic chunks, and generate 1536-dimensional vector embeddings for RAG retrieval.
                    </span>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                      Document Title
                    </label>
                    <input
                      type="text"
                      required
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="Payment Gateway Redis Connection Pool Runbook"
                      className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                        Markdown Content & Remediation Steps
                      </label>
                      <button
                        type="button"
                        onClick={insertTemplate}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
                      >
                        Insert Runbook Template
                      </button>
                    </div>
                    <textarea
                      required
                      rows={10}
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      placeholder="# Runbook Title&#10;&#10;## Diagnostic Symptoms&#10;- Symptom 1&#10;&#10;## Remediation Steps&#10;1. Step 1..."
                      className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-indigo-600/20"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {sourceType === 'URL' ? 'Fetch & Index URL' : 'Save & Index Document'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}