'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  CreateIntegrationRequest,
  IntegrationResponse,
  IntegrationType,
  UserRole,
} from '@sopon/contracts';
import {
  Radio,
  Plus,
  Copy,
  Check,
  Trash2,
  Loader2,
  X,
  AlertCircle,
  ExternalLink,
} from 'lucide-react';

export default function IntegrationsPage() {
  const { activeOrg, token } = useAuth();
  const [integrations, setIntegrations] = useState<IntegrationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add integration modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState<IntegrationType>('DATADOG');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Copied state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const loadIntegrations = async () => {
    if (!activeOrg || !token) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchApi<IntegrationResponse[]>(
        `/v1/organizations/${activeOrg.organizationId}/integrations`,
        {},
        token,
      );
      setIntegrations(res.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String(err.message));
      } else {
        setError('Failed to load integrations');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIntegrations();
  }, [activeOrg?.organizationId, token]);

  const handleCreateIntegration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !token) return;
    setModalError(null);
    setIsSubmitting(true);

    try {
      const payload: CreateIntegrationRequest = {
        name: name.trim(),
        type,
      };

      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/integrations`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        token,
      );

      setIsAddModalOpen(false);
      setName('');
      await loadIntegrations();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setModalError(String(err.message));
      } else {
        setModalError('Failed to create integration');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteIntegration = async (integrationId: string, integrationName: string) => {
    if (!activeOrg || !token) return;
    if (!confirm(`Are you sure you want to delete the ${integrationName} integration?`)) {
      return;
    }

    try {
      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/integrations/${integrationId}`,
        {
          method: 'DELETE',
        },
        token,
      );
      await loadIntegrations();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    }
  };

  const canManage = activeOrg?.role === UserRole.OWNER || activeOrg?.role === UserRole.ADMIN;

  const copyToClipboard = (text: string, id: string) => {
    const fullUrl = `${window.location.origin}${text}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Radio className="h-6 w-6 text-indigo-400" />
            Monitoring & Webhook Integrations
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Connect external monitoring providers (Datadog, Prometheus, Grafana, Sentry) to automatically trigger incidents in {activeOrg?.organizationName}.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Plus className="h-4 w-4" />
            Add Integration
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Integrations Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-12 flex justify-center items-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : integrations.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Radio className="h-10 w-10 text-slate-600 mx-auto" />
            <div className="font-medium text-white">No integrations configured yet</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Add a webhook integration to connect Prometheus Alertmanager or Datadog to SopON.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/80">
            {integrations.map((i) => (
              <div
                key={i.id}
                className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-800/30 transition-colors"
              >
                <div className="space-y-1.5 flex-1">
                  <div className="flex items-center gap-2.5">
                    <span className="font-bold text-white text-base">{i.name}</span>
                    <span className="px-2 py-0.5 rounded text-xs font-mono font-semibold uppercase bg-slate-800 text-indigo-400 border border-slate-700">
                      {i.type}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-400">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                      Active
                    </span>
                  </div>

                  <div className="flex items-center gap-2 max-w-xl">
                    <span className="text-xs text-slate-500">Webhook URL:</span>
                    <code className="text-xs text-slate-300 font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800 truncate">
                      {i.webhookUrl}
                    </code>
                    <button
                      onClick={() => copyToClipboard(i.webhookUrl, i.id)}
                      className="p-1.5 rounded text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 transition-colors shrink-0"
                      title="Copy full Webhook URL"
                    >
                      {copiedKey === i.id ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>

                {canManage && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleDeleteIntegration(i.id, i.name)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                      title="Delete Integration"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Integration Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-1">Add Alert Integration</h2>
            <p className="text-sm text-slate-400 mb-6">
              Generate an inbound webhook endpoint for {activeOrg?.organizationName}.
            </p>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateIntegration} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Integration Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Production Datadog Alerts"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Monitoring Provider
                </label>
                <select
                  value={type}
                  onChange={(e) => setType(e.target.value as IntegrationType)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="DATADOG">Datadog</option>
                  <option value="PROMETHEUS">Prometheus Alertmanager</option>
                  <option value="GRAFANA">Grafana</option>
                  <option value="SENTRY">Sentry</option>
                  <option value="GENERIC_WEBHOOK">Generic Inbound Webhook</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create Integration
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}