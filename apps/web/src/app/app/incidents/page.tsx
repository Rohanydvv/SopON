'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  CreateIncidentRequest,
  IncidentPriority,
  IncidentResponse,
  IncidentSeverity,
  IncidentStatus,
  MemberResponse,
  ServiceResponse,
  UserRole,
} from '@sopon/contracts';
import {
  AlertTriangle,
  Plus,
  Search,
  Filter,
  Loader2,
  Clock,
  User,
  Server,
  ArrowRight,
  X,
  AlertCircle,
} from 'lucide-react';

export default function IncidentsPage() {
  const { activeOrg, token } = useAuth();
  const [incidents, setIncidents] = useState<IncidentResponse[]>([]);
  const [services, setServices] = useState<ServiceResponse[]>([]);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filter states
  const [selectedStatus, setSelectedStatus] = useState<string>('ACTIVE');
  const [selectedSeverity, setSelectedSeverity] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Declare Incident Modal State
  const [isDeclareModalOpen, setIsDeclareModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>(IncidentSeverity.HIGH);
  const [priority, setPriority] = useState<IncidentPriority>(IncidentPriority.P2);
  const [serviceId, setServiceId] = useState('');
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const loadData = async () => {
    if (!activeOrg || !token) return;
    setIsLoading(true);
    setError(null);

    try {
      const [incidentsRes, servicesRes, membersRes] = await Promise.all([
        fetchApi<IncidentResponse[]>(
          `/v1/organizations/${activeOrg.organizationId}/incidents`,
          {},
          token,
        ),
        fetchApi<ServiceResponse[]>(
          `/v1/organizations/${activeOrg.organizationId}/services`,
          {},
          token,
        ),
        fetchApi<MemberResponse[]>(
          `/v1/organizations/${activeOrg.organizationId}/members`,
          {},
          token,
        ),
      ]);

      setIncidents(incidentsRes.data);
      setServices(servicesRes.data);
      setMembers(membersRes.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String(err.message));
      } else {
        setError('Failed to load incidents');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeOrg?.organizationId, token]);

  const handleDeclareIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !token) return;
    setModalError(null);
    setIsSubmitting(true);

    try {
      const payload: CreateIncidentRequest = {
        title: title.trim(),
        description: description.trim(),
        severity,
        priority,
        serviceId: serviceId || undefined,
        assigneeUserId: assigneeUserId || undefined,
      };

      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/incidents`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        token,
      );

      setIsDeclareModalOpen(false);
      setTitle('');
      setDescription('');
      setServiceId('');
      setAssigneeUserId('');
      await loadData();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setModalError(String(err.message));
      } else {
        setModalError('Failed to declare incident');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered incidents
  const filteredIncidents = incidents.filter((inc) => {
    // Status filter
    if (selectedStatus === 'ACTIVE') {
      if (inc.status === IncidentStatus.RESOLVED || inc.status === IncidentStatus.CLOSED) {
        return false;
      }
    } else if (selectedStatus !== 'ALL' && inc.status !== selectedStatus) {
      return false;
    }

    // Severity filter
    if (selectedSeverity !== 'ALL' && inc.severity !== selectedSeverity) {
      return false;
    }

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = inc.title.toLowerCase().includes(q);
      const matchDesc = inc.description.toLowerCase().includes(q);
      const matchService = inc.serviceName?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchService) {
        return false;
      }
    }

    return true;
  });

  const severityBadge = (sev: IncidentSeverity) => {
    const styles: Record<IncidentSeverity, string> = {
      [IncidentSeverity.CRITICAL]: 'bg-rose-500/15 text-rose-400 border-rose-500/30 font-bold',
      [IncidentSeverity.HIGH]: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
      [IncidentSeverity.MEDIUM]: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
      [IncidentSeverity.LOW]: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
    };

    return (
      <span className={`px-2 py-0.5 rounded text-xs uppercase border ${styles[sev]}`}>
        {sev}
      </span>
    );
  };

  const statusBadge = (status: IncidentStatus) => {
    const styles: Record<IncidentStatus, string> = {
      [IncidentStatus.OPEN]: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
      [IncidentStatus.ACKNOWLEDGED]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      [IncidentStatus.INVESTIGATING]: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
      [IncidentStatus.RESOLVED]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      [IncidentStatus.CLOSED]: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
      [IncidentStatus.REOPENED]: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    };

    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase border ${styles[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <AlertTriangle className="h-6 w-6 text-rose-500" />
            Incident Command Center
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Active real-time incident lifecycle, severity triage, and responder coordination for {activeOrg?.organizationName}.
          </p>
        </div>

        <button
          onClick={() => setIsDeclareModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition-colors shadow-lg shadow-rose-600/20"
        >
          <Plus className="h-4 w-4" />
          Declare Incident
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col md:flex-row items-center justify-between gap-4 shadow-lg">
        {/* Status Tabs */}
        <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800/80 w-full md:w-auto overflow-x-auto">
          {[
            { label: 'Active', val: 'ACTIVE' },
            { label: 'All', val: 'ALL' },
            { label: 'Open', val: IncidentStatus.OPEN },
            { label: 'Investigating', val: IncidentStatus.INVESTIGATING },
            { label: 'Resolved', val: IncidentStatus.RESOLVED },
            { label: 'Closed', val: IncidentStatus.CLOSED },
          ].map((tab) => (
            <button
              key={tab.val}
              onClick={() => setSelectedStatus(tab.val)}
              className={`px-3 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                selectedStatus === tab.val
                  ? 'bg-indigo-600 text-white shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Severity filter */}
          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            <option value="ALL">All Severities</option>
            <option value={IncidentSeverity.CRITICAL}>Critical</option>
            <option value={IncidentSeverity.HIGH}>High</option>
            <option value={IncidentSeverity.MEDIUM}>Medium</option>
            <option value={IncidentSeverity.LOW}>Low</option>
          </select>

          {/* Search box */}
          <div className="relative flex-1 md:w-64">
            <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search incidents..."
              className="w-full pl-9 pr-4 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>

      {/* Incidents List */}
      <div className="space-y-3">
        {isLoading ? (
          <div className="p-12 flex justify-center items-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : filteredIncidents.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center text-slate-400 space-y-2">
            <AlertTriangle className="h-8 w-8 text-slate-600 mx-auto" />
            <div className="font-semibold text-white">No incidents found</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No incidents matching the current filters. Your systems appear operational.
            </p>
          </div>
        ) : (
          filteredIncidents.map((inc) => (
            <Link
              key={inc.id}
              href={`/app/incidents/${inc.id}`}
              className="block p-5 bg-slate-900 hover:bg-slate-800/80 border border-slate-800 hover:border-slate-700/80 rounded-xl transition-all shadow-md group"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    {severityBadge(inc.severity)}
                    {statusBadge(inc.status)}
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {inc.priority}
                    </span>
                    {inc.serviceName && (
                      <span className="text-xs text-indigo-400 flex items-center gap-1">
                        <Server className="h-3 w-3" />
                        {inc.serviceName}
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-white group-hover:text-indigo-400 transition-colors">
                    {inc.title}
                  </h3>

                  <p className="text-xs text-slate-400 line-clamp-1">{inc.description}</p>
                </div>

                <div className="flex items-center gap-6 shrink-0 text-xs text-slate-400">
                  {inc.assigneeName ? (
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-indigo-400" />
                      <span>{inc.assigneeName}</span>
                    </div>
                  ) : (
                    <span className="text-slate-500">Unassigned</span>
                  )}

                  <div className="flex items-center gap-1.5 font-mono text-[11px]">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    <span>{new Date(inc.createdAt).toLocaleString()}</span>
                  </div>

                  <ArrowRight className="h-4 w-4 text-slate-600 group-hover:text-white transition-colors" />
                </div>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* Declare Incident Modal */}
      {isDeclareModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto">
            <button
              onClick={() => setIsDeclareModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Declare Incident
            </h2>
            <p className="text-sm text-slate-400 mb-6">
              Create an incident to coordinate responders, trace root cause, and monitor remediation.
            </p>

            {modalError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {modalError}
              </div>
            )}

            <form onSubmit={handleDeclareIncident} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Incident Title
                </label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Elevated HTTP 500 errors on Checkout API"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Description & Initial Symptoms
                </label>
                <textarea
                  required
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe the degradation, impact on users, and any relevant metrics or error logs..."
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Severity
                  </label>
                  <select
                    value={severity}
                    onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value={IncidentSeverity.CRITICAL}>Critical (Total Outage)</option>
                    <option value={IncidentSeverity.HIGH}>High (Major Disruption)</option>
                    <option value={IncidentSeverity.MEDIUM}>Medium (Partial Degradation)</option>
                    <option value={IncidentSeverity.LOW}>Low (Minor Issue)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Priority
                  </label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as IncidentPriority)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value={IncidentPriority.P1}>P1 - Immediate (24/7)</option>
                    <option value={IncidentPriority.P2}>P2 - Urgent</option>
                    <option value={IncidentPriority.P3}>P3 - Standard</option>
                    <option value={IncidentPriority.P4}>P4 - Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Affected Service
                  </label>
                  <select
                    value={serviceId}
                    onChange={(e) => setServiceId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="">-- None / General --</option>
                    {services.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} ({s.environment})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Incident Commander
                  </label>
                  <select
                    value={assigneeUserId}
                    onChange={(e) => setAssigneeUserId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500"
                  >
                    <option value="">-- Unassigned --</option>
                    {members.map((m) => (
                      <option key={m.userId} value={m.userId}>
                        {m.name} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsDeclareModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 shadow-lg shadow-rose-600/20"
                >
                  {isSubmitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  Declare Incident
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}