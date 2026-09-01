'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  DocumentDetailResponse,
  DocumentSourceType,
  UpdateDocumentRequest,
  UserRole,
} from '@sopon/contracts';
import {
  BookOpen,
  ArrowLeft,
  Edit3,
  Eye,
  Save,
  Trash2,
  Loader2,
  AlertCircle,
  Layers,
  Clock,
  Sparkles,
} from 'lucide-react';

export default function SopDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { activeOrg, token } = useAuth();
  const documentId = typeof params.documentId === 'string' ? params.documentId : '';

  const [document, setDocument] = useState<DocumentDetailResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit Mode State
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [sourceType, setSourceType] = useState<DocumentSourceType>('RUNBOOK');
  const [content, setContent] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadDocument = async () => {
    if (!activeOrg || !token || !documentId) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchApi<DocumentDetailResponse>(
        `/v1/organizations/${activeOrg.organizationId}/documents/${documentId}`,
        {},
        token,
      );

      setDocument(res.data);
      setTitle(res.data.title);
      setSourceType(res.data.sourceType);
      setContent(res.data.content);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String(err.message));
      } else {
        setError('Failed to load SOP document');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDocument();
  }, [activeOrg?.organizationId, documentId, token]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !token || !documentId) return;
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const payload: UpdateDocumentRequest = {
        title: title.trim(),
        sourceType,
        content: content.trim(),
      };

      const res = await fetchApi<DocumentDetailResponse>(
        `/v1/organizations/${activeOrg.organizationId}/documents/${documentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
        token,
      );

      setDocument(res.data);
      setIsEditing(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!activeOrg || !token || !document) return;
    if (!confirm(`Are you sure you want to delete "${document.title}"?`)) return;

    try {
      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/documents/${documentId}`,
        { method: 'DELETE' },
        token,
      );
      router.push('/app/sops');
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    }
  };

  const canManage = activeOrg?.role !== UserRole.VIEWER;
  const isOwnerOrAdmin = activeOrg?.role === UserRole.OWNER || activeOrg?.role === UserRole.ADMIN;

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !document) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-white">Document Not Found</h2>
        <p className="text-sm text-slate-400">{error || 'This SOP document does not exist or you lack permission.'}</p>
        <Link
          href="/app/sops"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to SOPs
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Navigation and Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <Link
          href="/app/sops"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to SOP Knowledge Base
        </Link>

        <div className="flex items-center gap-2">
          {saveSuccess && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium bg-emerald-500/10 px-2.5 py-1 rounded-lg border border-emerald-500/20">
              <Sparkles className="h-3.5 w-3.5" /> Saved & Vector Re-indexed
            </span>
          )}

          {canManage && (
            <button
              onClick={() => setIsEditing(!isEditing)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-white transition-colors"
            >
              {isEditing ? <Eye className="h-3.5 w-3.5" /> : <Edit3 className="h-3.5 w-3.5" />}
              {isEditing ? 'View Mode' : 'Edit Markdown'}
            </button>
          )}

          {isOwnerOrAdmin && (
            <button
              onClick={handleDelete}
              className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
              title="Delete SOP"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Main Workspace */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        {isEditing ? (
          <form onSubmit={handleSave} className="p-6 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Document Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

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
                  <option value="POSTMORTEM">Postmortem</option>
                  <option value="DOCUMENT">Standard Document</option>
                  <option value="URL">External URL</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Markdown Content
              </label>
              <textarea
                required
                rows={18}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white font-mono text-xs leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save & Re-Index
              </button>
            </div>
          </form>
        ) : (
          <div>
            {/* View Header */}
            <div className="p-8 border-b border-slate-800 bg-slate-950/40 space-y-3">
              <div className="flex items-center gap-3">
                <span className="px-2.5 py-0.5 rounded text-xs uppercase font-mono font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  {document.sourceType}
                </span>
                <span className="text-xs text-slate-500 font-mono">v{document.version}</span>
              </div>

              <h1 className="text-2xl font-bold text-white tracking-tight">{document.title}</h1>

              <div className="flex items-center gap-6 text-xs text-slate-400 pt-1">
                <span className="flex items-center gap-1.5 font-mono">
                  <Layers className="h-3.5 w-3.5 text-indigo-400" />
                  {document.chunkCount ?? 1} Vector Chunks (pgvector indexed)
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-slate-500" />
                  Last Updated: {new Date(document.updatedAt).toLocaleString()}
                </span>
              </div>
            </div>

            {/* Markdown Body */}
            <div className="p-8 prose prose-invert max-w-none">
              <pre className="p-6 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 text-xs font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto">
                {document.content}
              </pre>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}