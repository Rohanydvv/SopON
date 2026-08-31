'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  CreateServiceRequest,
  ServiceEnvironment,
  ServiceResponse,
  ServiceStatus,
  UserRole,
} from '@sopon/contracts';
import {
  Server,
  Plus,
  Activity,
  AlertTriangle,
  ExternalLink,
  Trash2,
  Loader2,
  X,
  AlertCircle,
} from 'lucide-react';

export default function ServicesPage() {
  const { activeOrg, token } = useAuth();
  const [services, setServices] = useState<ServiceResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add service modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tier, setTier] = useState('Tier 2');
  const [environment, setEnvironment] = useState<ServiceEnvironment>(ServiceEnvironment.PRODUCTION);
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadServices = async () => {
    if (!activeOrg || !token) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchApi<ServiceResponse[]>(
        `/v1/organizations/${activeOrg.organizationId}/services`,
        {},
        token,
      );
      setServices(res.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String(err.message));
      } else {
        setError('Failed to load services catalog');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadServices();
  }, [activeOrg?.organizationId, token]);

  const handleCreateService = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !token) return;
    setModalError(null);
    setIsSubmitting(true);

    try {
      const payload: CreateServiceRequest = {
        name: name.trim(),
        description: description.trim() || undefined,
        tier,
        environment,
        repositoryUrl: repositoryUrl.trim() || undefined,
      };

      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/services`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        token,
      );

      setIsAddModalOpen(false);
      setName('');
      setDescription('');
      setRepositoryUrl('');
      await loadServices();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setModalError(String(err.message));
      } else {
        setModalError('Failed to register service');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleStatusChange = async (serviceId: string, newStatus: ServiceStatus) => {
    if (!activeOrg || !token) return;

    try {
      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/services/${serviceId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        },
        token,
      );
      await loadServices();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    }
  };

  const handleDeleteService = async (serviceId: string, serviceName: string) => {
    if (!activeOrg || !token) return;
    if (!confirm(`Are you sure you want to remove ${serviceName} from the service catalog?`)) {
      return;
    }

    try {
      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/services/${serviceId}`,
        {
          method: 'DELETE',
        },
        token,
      );
      await loadServices();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    }
  };

  const canManage = activeOrg?.role !== UserRole.VIEWER;
  const isOwnerOrAdmin = activeOrg?.role === UserRole.OWNER || activeOrg?.role === UserRole.ADMIN;

  const statusBadge = (status: ServiceStatus) => {
    const config: Record<ServiceStatus, { bg: string; dot: string; text: string }> = {
      [ServiceStatus.OPERATIONAL]: {
        bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
        dot: 'bg-emerald-400',
        text: 'Operational',
      },
      [ServiceStatus.DEGRADED]: {
        bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
        dot: 'bg-amber-400',
        text: 'Degraded',
      },
      [ServiceStatus.OUTAGE]: {
        bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
        dot: 'bg-rose-400',
        text: 'Outage',
      },
      [ServiceStatus.MAINTENANCE]: {
        bg: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        dot: 'bg-blue-400',
        text: 'Maintenance',
      },
    };

    const item = config[status] || config[ServiceStatus.OPERATIONAL];

    return (
      <span
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase border ${item.bg}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${item.dot}`} />
        {item.text}
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Server className="h-6 w-6 text-indigo-400" />
            Services Catalog
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Registered microservices, dependencies, environments, and real-time operational status for {activeOrg?.organizationName}.
          </p>
        </div>

        {canManage && (
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
          >
            <Plus className="h-4 w-4" />
            Register Service
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Services Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-12 flex justify-center items-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : services.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-3">
            <Server className="h-10 w-10 text-slate-600 mx-auto" />
            <div className="font-medium text-white">No services registered yet</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Register your microservices to attach them to incidents, automate alert routing, and monitor health.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-6">Service</th>
                  <th className="py-3 px-6">Environment</th>
                  <th className="py-3 px-6">Tier</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Repository</th>
                  {isOwnerOrAdmin && <th className="py-3 px-6 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {services.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 px-6">
                      <div className="flex flex-col">
                        <span className="font-semibold text-white">{s.name}</span>
                        <span className="text-xs text-slate-400 font-mono">{s.slug}</span>
                        {s.description && (
                          <span className="text-xs text-slate-500 mt-0.5">{s.description}</span>
                        )}
                      </div>
                    </td>
                    <td className="py-4 px-6">
                      <span className="px-2 py-0.5 rounded text-xs font-semibold uppercase bg-slate-800 text-slate-300 border border-slate-700">
                        {s.environment}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-xs text-slate-400 font-medium">
                      {s.tier}
                    </td>
                    <td className="py-4 px-6">
                      {canManage ? (
                        <select
                          value={s.status}
                          onChange={(e) => handleStatusChange(s.id, e.target.value as ServiceStatus)}
                          className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value={ServiceStatus.OPERATIONAL}>Operational</option>
                          <option value={ServiceStatus.DEGRADED}>Degraded</option>
                          <option value={ServiceStatus.OUTAGE}>Outage</option>
                          <option value={ServiceStatus.MAINTENANCE}>Maintenance</option>
                        </select>
                      ) : (
                        statusBadge(s.status)
                      )}
                    </td>
                    <td className="py-4 px-6 text-xs">
                      {s.repositoryUrl ? (
                        <a
                          href={s.repositoryUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-1"
                        >
                          Repo <ExternalLink className="h-3 w-3" />
                        </a>
                      ) : (
                        <span className="text-slate-600">—</span>
                      )}
                    </td>
                    {isOwnerOrAdmin && (
                      <td className="py-4 px-6 text-right">
                        <button
                          onClick={() => handleDeleteService(s.id, s.name)}
                          className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                          title="Delete Service"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Register Service Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsAddModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-1">Register Service</h2>
            <p className="text-sm text-slate-400 mb-6">
              Add a microservice to the {activeOrg?.organizationName} service catalog.
            </p>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleCreateService} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Service Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Payment Gateway API"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Description
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Handles checkout card payments and Stripe webhooks"
                  rows={2}
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Environment
                  </label>
                  <select
                    value={environment}
                    onChange={(e) => setEnvironment(e.target.value as ServiceEnvironment)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={ServiceEnvironment.PRODUCTION}>Production</option>
                    <option value={ServiceEnvironment.STAGING}>Staging</option>
                    <option value={ServiceEnvironment.DEVELOPMENT}>Development</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Service Tier
                  </label>
                  <select
                    value={tier}
                    onChange={(e) => setTier(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="Tier 1">Tier 1 (Mission Critical)</option>
                    <option value="Tier 2">Tier 2 (High Priority)</option>
                    <option value="Tier 3">Tier 3 (Supporting)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Repository URL (Optional)
                </label>
                <input
                  type="url"
                  value={repositoryUrl}
                  onChange={(e) => setRepositoryUrl(e.target.value)}
                  placeholder="https://github.com/org/payment-service"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
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
                  Register Service
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}