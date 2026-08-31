'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  CreateTimelineEventRequest,
  IncidentPriority,
  IncidentResponse,
  IncidentSeverity,
  IncidentStatus,
  MemberResponse,
  TimelineEventResponse,
  UpdateIncidentRequest,
} from '@sopon/contracts';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  MessageSquare,
  Send,
  Server,
  ShieldAlert,
  User,
  Zap,
  Loader2,
  AlertCircle,
  Activity,
} from 'lucide-react';

export default function IncidentWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const { activeOrg, token, user } = useAuth();
  const incidentId = typeof params.incidentId === 'string' ? params.incidentId : '';

  const [incident, setIncident] = useState<IncidentResponse | null>(null);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Note composer state
  const [noteMessage, setNoteMessage] = useState('');
  const [isPostingNote, setIsPostingNote] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

  const loadIncidentData = async () => {
    if (!activeOrg || !token || !incidentId) return;
    setIsLoading(true);
    setError(null);

    try {
      const [incRes, membersRes] = await Promise.all([
        fetchApi<IncidentResponse>(
          `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}`,
          {},
          token,
        ),
        fetchApi<MemberResponse[]>(
          `/v1/organizations/${activeOrg.organizationId}/members`,
          {},
          token,
        ),
      ]);

      setIncident(incRes.data);
      setMembers(membersRes.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String(err.message));
      } else {
        setError('Failed to load incident details');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadIncidentData();
  }, [activeOrg?.organizationId, incidentId, token]);

  const handleStatusTransition = async (newStatus: IncidentStatus) => {
    if (!activeOrg || !token || !incident) return;
    setIsUpdatingStatus(true);

    try {
      const res = await fetchApi<IncidentResponse>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ status: newStatus }),
        },
        token,
      );

      setIncident(res.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleAssigneeChange = async (newAssigneeId: string) => {
    if (!activeOrg || !token || !incident) return;

    try {
      const res = await fetchApi<IncidentResponse>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ assigneeUserId: newAssigneeId || null }),
        },
        token,
      );

      setIncident(res.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    }
  };

  const handlePostNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !token || !incident || !noteMessage.trim()) return;
    setIsPostingNote(true);

    try {
      const payload: CreateTimelineEventRequest = {
        message: noteMessage.trim(),
        eventType: 'NOTE_ADDED',
      };

      await fetchApi<TimelineEventResponse>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}/timeline`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        token,
      );

      setNoteMessage('');
      await loadIncidentData();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    } finally {
      setIsPostingNote(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="max-w-4xl mx-auto p-8 text-center space-y-4">
        <AlertCircle className="h-10 w-10 text-rose-500 mx-auto" />
        <h2 className="text-xl font-bold text-white">Incident Not Found</h2>
        <p className="text-sm text-slate-400">{error || 'This incident does not exist or you lack permission.'}</p>
        <Link
          href="/app/incidents"
          className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 text-white rounded-lg text-sm"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Incidents
        </Link>
      </div>
    );
  }

  const severityBadge = (sev: IncidentSeverity) => {
    const styles: Record<IncidentSeverity, string> = {
      [IncidentSeverity.CRITICAL]: 'bg-rose-500/20 text-rose-400 border-rose-500/30 font-bold',
      [IncidentSeverity.HIGH]: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      [IncidentSeverity.MEDIUM]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      [IncidentSeverity.LOW]: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
    };

    return (
      <span className={`px-2.5 py-1 rounded text-xs uppercase border ${styles[sev]}`}>
        {sev}
      </span>
    );
  };

  const statusBadge = (status: IncidentStatus) => {
    const styles: Record<IncidentStatus, string> = {
      [IncidentStatus.OPEN]: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
      [IncidentStatus.ACKNOWLEDGED]: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      [IncidentStatus.INVESTIGATING]: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      [IncidentStatus.RESOLVED]: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      [IncidentStatus.CLOSED]: 'bg-slate-500/20 text-slate-400 border-slate-500/30',
      [IncidentStatus.REOPENED]: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    };

    return (
      <span className={`px-2.5 py-1 rounded text-xs font-semibold uppercase border ${styles[status]}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Back Link & Header */}
      <div className="space-y-4">
        <Link
          href="/app/incidents"
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Incident Board
        </Link>

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl">
          <div className="space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              {severityBadge(incident.severity)}
              {statusBadge(incident.status)}
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                {incident.priority}
              </span>
              <span className="text-xs text-slate-400 font-mono">ID: {incident.id.slice(0, 8)}</span>
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">{incident.title}</h1>
          </div>

          {/* Status Action Buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {incident.status === IncidentStatus.OPEN && (
              <button
                disabled={isUpdatingStatus}
                onClick={() => handleStatusTransition(IncidentStatus.ACKNOWLEDGED)}
                className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Acknowledge
              </button>
            )}

            {(incident.status === IncidentStatus.OPEN ||
              incident.status === IncidentStatus.ACKNOWLEDGED) && (
              <button
                disabled={isUpdatingStatus}
                onClick={() => handleStatusTransition(IncidentStatus.INVESTIGATING)}
                className="px-3.5 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Start Investigation
              </button>
            )}

            {incident.status !== IncidentStatus.RESOLVED && incident.status !== IncidentStatus.CLOSED && (
              <button
                disabled={isUpdatingStatus}
                onClick={() => handleStatusTransition(IncidentStatus.RESOLVED)}
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                Resolve Incident
              </button>
            )}

            {incident.status === IncidentStatus.RESOLVED && (
              <button
                disabled={isUpdatingStatus}
                onClick={() => handleStatusTransition(IncidentStatus.CLOSED)}
                className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Close Incident
              </button>
            )}

            {incident.status === IncidentStatus.CLOSED && (
              <button
                disabled={isUpdatingStatus}
                onClick={() => handleStatusTransition(IncidentStatus.REOPENED)}
                className="px-3.5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
              >
                Reopen Incident
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Workspace Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Context & Metadata */}
        <div className="lg:col-span-1 space-y-6">
          {/* Overview Card */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-lg space-y-4">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Incident Context
            </h3>

            <div>
              <div className="text-xs text-slate-500 font-medium">Description</div>
              <p className="text-sm text-slate-200 mt-1 whitespace-pre-wrap leading-relaxed">
                {incident.description}
              </p>
            </div>

            <div className="h-px bg-slate-800" />

            <div>
              <div className="text-xs text-slate-500 font-medium mb-1.5">Affected Service</div>
              {incident.serviceName ? (
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white">
                  <Server className="h-4 w-4 text-indigo-400" />
                  <span className="font-medium">{incident.serviceName}</span>
                </div>
              ) : (
                <span className="text-xs text-slate-500">No service attached</span>
              )}
            </div>

            <div>
              <div className="text-xs text-slate-500 font-medium mb-1.5">Incident Commander</div>
              <select
                value={incident.assigneeUserId || ''}
                onChange={(e) => handleAssigneeChange(e.target.value)}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              >
                <option value="">-- Unassigned --</option>
                {members.map((m) => (
                  <option key={m.userId} value={m.userId}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <div className="text-xs text-slate-500 font-medium mb-1.5">Source</div>
              <span className="px-2 py-0.5 rounded text-xs font-mono bg-slate-950 text-slate-300 border border-slate-800">
                {incident.source}
              </span>
            </div>
          </div>

          {/* Timestamps Card */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-xl shadow-lg space-y-3">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Operational Timeline
            </h3>

            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-800/60">
                <span className="text-slate-500">Declared:</span>
                <span className="text-slate-300 font-mono">{new Date(incident.createdAt).toLocaleString()}</span>
              </div>
              {incident.acknowledgedAt && (
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Acknowledged:</span>
                  <span className="text-slate-300 font-mono">{new Date(incident.acknowledgedAt).toLocaleString()}</span>
                </div>
              )}
              {incident.resolvedAt && (
                <div className="flex justify-between py-1 border-b border-slate-800/60">
                  <span className="text-slate-500">Resolved:</span>
                  <span className="text-emerald-400 font-mono">{new Date(incident.resolvedAt).toLocaleString()}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Activity Stream & Note Composer */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-lg p-6 space-y-6">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-indigo-400" />
              Activity & Responder Timeline
            </h3>

            {/* Note Composer */}
            <form onSubmit={handlePostNote} className="space-y-3">
              <div className="relative">
                <textarea
                  required
                  rows={3}
                  value={noteMessage}
                  onChange={(e) => setNoteMessage(e.target.value)}
                  placeholder="Post an investigation update, metric diagnosis, or mitigation note..."
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isPostingNote || !noteMessage.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isPostingNote ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  Post Note
                </button>
              </div>
            </form>

            <div className="h-px bg-slate-800" />

            {/* Timeline Stream */}
            <div className="space-y-4">
              {incident.timeline && incident.timeline.length > 0 ? (
                incident.timeline.map((event) => (
                  <div
                    key={event.id}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-white">
                          {event.actorName || 'System'}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                          {event.eventType}
                        </span>
                      </div>
                      <span className="text-slate-500 font-mono text-[11px]">
                        {new Date(event.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {event.message}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-slate-500 text-xs">
                  No activity events recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}