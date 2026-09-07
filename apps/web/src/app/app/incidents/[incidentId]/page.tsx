'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  ActionExecutionResponse,
  ActionType,
  CreateTimelineEventRequest,
  ExecutableRemediationAction,
  IncidentAnalysisResponse,
  IncidentResponse,
  IncidentSeverity,
  IncidentStatus,
  MemberResponse,
  OrganizationRemediationPolicyResponse,
  RecommendedSopResponse,
  TimelineEventResponse,
  UserRole,
} from '@sopon/contracts';
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Bot,
  CheckCircle,
  CheckCircle2,
  CheckSquare,
  Cpu,
  ExternalLink,
  Eye,
  FileCheck,
  Loader2,
  Play,
  Power,
  RotateCcw,
  Send,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  Sparkles,
  Terminal,
  X,
  XCircle,
} from 'lucide-react';

function mapCopilotActionType(actionType: string): ActionType {
  switch (actionType) {
    case 'RESTART_POD':
    case 'RESTART_SERVICE_WORKER':
      return 'RESTART_SERVICE_WORKER';
    case 'SCALE_SERVICE':
    case 'SCALE_SERVICE_REPLICAS':
      return 'SCALE_SERVICE_REPLICAS';
    case 'CONFIG_UPDATE':
    case 'UPDATE_POOL_CONFIG':
      return 'UPDATE_POOL_CONFIG';
    case 'CLEAR_CACHE':
    case 'CLEAR_SERVICE_CACHE':
      return 'CLEAR_SERVICE_CACHE';
    case 'ROLLBACK_DEPLOYMENT':
    case 'TRIGGER_ROLLBACK':
      return 'TRIGGER_ROLLBACK';
    default:
      return 'RESTART_SERVICE_WORKER';
  }
}

function buildDefaultParams(act: ExecutableRemediationAction, serviceId?: string | null): Record<string, unknown> {
  const targetType = mapCopilotActionType(act.actionType);
  switch (targetType) {
    case 'RESTART_SERVICE_WORKER':
      return {
        serviceId: serviceId || undefined,
        gracePeriodSeconds: 30,
        drainConnections: true,
        reason: act.description || 'Controlled remediation restart',
      };
    case 'SCALE_SERVICE_REPLICAS':
      return {
        serviceId: serviceId || undefined,
        targetReplicas: 4,
        reason: act.description || 'Autonomous scale up',
      };
    case 'UPDATE_POOL_CONFIG':
      return {
        serviceId: serviceId || undefined,
        maxConnections: 50,
        timeoutMs: 5000,
        reason: act.description || 'Autonomous pool config update',
      };
    case 'CLEAR_SERVICE_CACHE':
      return {
        serviceId: serviceId || undefined,
        keyPrefix: 'cache:*',
        reason: act.description || 'Autonomous cache eviction',
      };
    default:
      return {
        serviceId: serviceId || undefined,
        reason: act.description || 'Autonomous remediation',
      };
  }
}

export default function IncidentWorkspacePage() {
  const params = useParams();
  const { activeOrg, token, user } = useAuth();
  const incidentId = typeof params.incidentId === 'string' ? params.incidentId : '';

  const [incident, setIncident] = useState<IncidentResponse | null>(null);
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [recommendedSops, setRecommendedSops] = useState<RecommendedSopResponse[]>([]);
  const [analysis, setAnalysis] = useState<IncidentAnalysisResponse | null>(null);
  const [policy, setPolicy] = useState<OrganizationRemediationPolicyResponse | null>(null);
  const [actionsHistory, setActionsHistory] = useState<ActionExecutionResponse[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingSops, setIsLoadingSops] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Execution modal state
  const [modalExecution, setModalExecution] = useState<ActionExecutionResponse | null>(null);

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

      loadRecommendedSops();
      loadAnalysis();
      loadActionsAndPolicy();
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

  const loadRecommendedSops = async () => {
    if (!activeOrg || !token || !incidentId) return;
    setIsLoadingSops(true);

    try {
      const sopsRes = await fetchApi<RecommendedSopResponse[]>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}/recommended-sops`,
        {},
        token,
      );
      setRecommendedSops(sopsRes.data);
    } catch {
      // Non-blocking
    } finally {
      setIsLoadingSops(false);
    }
  };

  const loadAnalysis = async () => {
    if (!activeOrg || !token || !incidentId) return;

    try {
      const res = await fetchApi<IncidentAnalysisResponse>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}/analysis`,
        {},
        token,
      );
      if (res.data && res.data.understand) {
        setAnalysis(res.data);
      }
    } catch {
      // Non-blocking
    }
  };

  const loadActionsAndPolicy = async () => {
    if (!activeOrg || !token || !incidentId) return;
    try {
      const [policyRes, actionsRes] = await Promise.all([
        fetchApi<OrganizationRemediationPolicyResponse>(
          `/v1/organizations/${activeOrg.organizationId}/remediation-policy`,
          {},
          token,
        ),
        fetchApi<ActionExecutionResponse[]>(
          `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}/actions`,
          {},
          token,
        ),
      ]);
      setPolicy(policyRes.data);
      setActionsHistory(actionsRes.data);
    } catch {
      // Non-blocking
    }
  };

  const triggerAutonomousInvestigation = async () => {
    if (!activeOrg || !token || !incidentId) return;
    setIsAnalyzing(true);

    try {
      const res = await fetchApi<IncidentAnalysisResponse>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}/analyze`,
        { method: 'POST' },
        token,
      );
      setAnalysis(res.data);
      await loadIncidentData();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleToggleKillSwitch = async () => {
    if (!activeOrg || !token || !policy) return;
    const newStatus = !policy.autonomousRemediationEnabled;
    try {
      const res = await fetchApi<OrganizationRemediationPolicyResponse>(
        `/v1/organizations/${activeOrg.organizationId}/remediation-policy`,
        {
          method: 'PATCH',
          body: JSON.stringify({ autonomousRemediationEnabled: newStatus }),
        },
        token,
      );
      setPolicy(res.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    }
  };

  const handleRunDryRun = async (act: ExecutableRemediationAction) => {
    if (!activeOrg || !token || !incident) return;
    setActionLoadingId(`dryrun-${act.actionId}`);

    try {
      const targetType = mapCopilotActionType(act.actionType);
      const params = buildDefaultParams(act, incident.serviceId);

      const res = await fetchApi<ActionExecutionResponse>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}/actions/dry-run`,
        {
          method: 'POST',
          body: JSON.stringify({
            actionType: targetType,
            targetServiceId: incident.serviceId || undefined,
            parameters: params,
          }),
        },
        token,
      );

      setModalExecution(res.data);
      await loadActionsAndPolicy();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(`Dry Run Error: ${String(err.message)}`);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRunExecute = async (act: ExecutableRemediationAction) => {
    if (!activeOrg || !token || !incident) return;
    setActionLoadingId(`exec-${act.actionId}`);

    try {
      const targetType = mapCopilotActionType(act.actionType);
      const params = buildDefaultParams(act, incident.serviceId);

      const res = await fetchApi<ActionExecutionResponse>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}/actions/execute`,
        {
          method: 'POST',
          body: JSON.stringify({
            actionType: targetType,
            targetServiceId: incident.serviceId || undefined,
            parameters: params,
          }),
        },
        token,
      );

      setModalExecution(res.data);
      await loadIncidentData();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(`Execution Error: ${String(err.message)}`);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleApproveAction = async (actionId: string) => {
    if (!activeOrg || !token) return;
    setActionLoadingId(`approve-${actionId}`);

    try {
      const res = await fetchApi<ActionExecutionResponse>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}/actions/${actionId}/approve`,
        { method: 'POST' },
        token,
      );
      setModalExecution(res.data);
      await loadIncidentData();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(`Approval Error: ${String(err.message)}`);
      }
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleRollbackAction = async (actionId: string) => {
    if (!activeOrg || !token) return;
    if (!confirm('Are you sure you want to trigger a safe rollback for this remediation action?')) return;
    setActionLoadingId(`rollback-${actionId}`);

    try {
      const res = await fetchApi<ActionExecutionResponse>(
        `/v1/organizations/${activeOrg.organizationId}/incidents/${incidentId}/actions/${actionId}/rollback`,
        { method: 'POST' },
        token,
      );
      setModalExecution(res.data);
      await loadIncidentData();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(`Rollback Error: ${String(err.message)}`);
      }
    } finally {
      setActionLoadingId(null);
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

  const riskTierBadge = (tier: string) => {
    if (tier === 'SAFE_AUTOMATIC') {
      return (
        <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          SAFE AUTOMATIC (ZERO TOUCH)
        </span>
      );
    }
    if (tier === 'REQUIRES_APPROVAL') {
      return (
        <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          REQUIRES APPROVAL
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-rose-500/15 text-rose-400 border border-rose-500/30">
        MANUAL ESCALATION
      </span>
    );
  };

  const executionStatusBadge = (status: string, isDryRun: boolean) => {
    if (isDryRun) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
          DRY RUN (SIMULATED)
        </span>
      );
    }
    switch (status) {
      case 'SUCCEEDED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            SUCCEEDED
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
            FAILED
          </span>
        );
      case 'PENDING_APPROVAL':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
            PENDING APPROVAL
          </span>
        );
      case 'ROLLED_BACK':
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
            ROLLED BACK
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-slate-300 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  const isOperator = activeOrg?.role === UserRole.OWNER || activeOrg?.role === UserRole.ADMIN || activeOrg?.role === UserRole.MANAGER;

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

        {/* Remediation Safety & Kill Switch Banner */}
        {policy && (
          <div className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
            policy.autonomousRemediationEnabled
              ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
              : 'bg-rose-950/30 border-rose-500/40 text-rose-300'
          }`}>
            <div className="flex items-center gap-3">
              <Shield className={`h-5 w-5 ${policy.autonomousRemediationEnabled ? 'text-emerald-400' : 'text-rose-400'}`} />
              <div>
                <div className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                  <span>Autonomous Remediation Engine:</span>
                  <span className={`px-2 py-0.5 rounded font-mono ${
                    policy.autonomousRemediationEnabled ? 'bg-emerald-500/20 text-emerald-300' : 'bg-rose-500/20 text-rose-300'
                  }`}>
                    {policy.autonomousRemediationEnabled ? 'ARMED & ACTIVE' : 'EMERGENCY KILL-SWITCH ENGAGED'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {policy.autonomousRemediationEnabled
                    ? `Multi-Gate Safety Engine active (Max concurrent: ${policy.maxConcurrentActions}, Cooldown: ${policy.cooldownPeriodMinutes}m, Production approval: ${policy.requireApprovalForProduction ? 'Required' : 'Automated'}).`
                    : 'Remediation executions are strictly blocked across the organization until kill-switch is disengaged.'}
                </p>
              </div>
            </div>

            {isOperator && (
              <button
                onClick={handleToggleKillSwitch}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                  policy.autonomousRemediationEnabled
                    ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/20'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-600/20'
                }`}
              >
                <Power className="h-3.5 w-3.5" />
                {policy.autonomousRemediationEnabled ? 'Engage Kill Switch' : 'Disengage Kill Switch'}
              </button>
            )}
          </div>
        )}

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
            <button
              onClick={triggerAutonomousInvestigation}
              disabled={isAnalyzing}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
            >
              {isAnalyzing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              Run Autonomous RCA
            </button>

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

      {/* Autonomous AI Reasoning & RCA Command Card */}
      {analysis && (
        <div className="p-6 bg-slate-900 border border-indigo-500/40 rounded-2xl shadow-2xl space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <Bot className="h-6 w-6 text-indigo-400" />
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  Autonomous Operations Reasoning & RCA
                </h2>
                <span className="text-xs text-slate-400">
                  Full Autonomous Pipeline: Understand → Investigate → Retrieve → Reason → Decide → Plan → Act → Verify
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {riskTierBadge(analysis.decidePlan.riskTier)}
              <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                Confidence: {Math.round(analysis.reasonRca.confidenceScore * 100)}% ({analysis.reasonRca.confidenceLevel})
              </span>
              {analysis.resolveEscalate.isReady ? (
                <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 flex items-center gap-1">
                  <ShieldCheck className="h-3.5 w-3.5" /> Autonomous Ready
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded text-xs font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  Supervised Escalation
                </span>
              )}
            </div>
          </div>

          {/* Root Cause Analysis Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Primary Root Cause & Evidence */}
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                <Cpu className="h-4 w-4 text-indigo-400" /> Primary Root Cause Analysis
              </div>

              <div className="p-3.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-sm text-indigo-200 font-medium leading-relaxed">
                {analysis.reasonRca.primaryRootCause}
              </div>

              {/* Contributing Factors */}
              {analysis.reasonRca.contributingFactors.length > 0 && (
                <div className="space-y-1.5 pt-2">
                  <div className="text-xs font-semibold text-slate-400 uppercase">Contributing Factors:</div>
                  {analysis.reasonRca.contributingFactors.map((factor, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-slate-300">
                      <span className="text-indigo-400 font-mono">•</span>
                      <span>{factor}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Evidence Chain */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="text-xs font-semibold text-slate-400 uppercase">Multi-Source Evidence Chain:</div>
                <div className="space-y-2">
                  {analysis.reasonRca.evidenceChain.map((ev, idx) => (
                    <div key={idx} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-white">{ev.signal}</span>
                        <span className="text-slate-500 font-mono text-[11px]">{ev.source}</span>
                      </div>
                      <p className="text-slate-400 text-[11px]">{ev.observation}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Structured Remediation Plan & Execution Controls */}
            <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-4">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sliders className="h-4 w-4 text-emerald-400" /> Structured Remediation Plan (ACT Engine)
                </div>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded font-mono">
                  Multi-Gate Protected
                </span>
              </div>

              <div className="space-y-3">
                {analysis.decidePlan.actions.map((act) => {
                  const targetActionType = mapCopilotActionType(act.actionType);
                  const isDryRunning = actionLoadingId === `dryrun-${act.actionId}`;
                  const isExecuting = actionLoadingId === `exec-${act.actionId}`;

                  return (
                    <div key={act.actionId} className="p-3.5 rounded-lg bg-slate-900 border border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                            STEP {act.order}: {targetActionType}
                          </span>
                          <span className="text-xs font-semibold text-white">{act.targetService}</span>
                        </div>
                        <span className="text-[11px] font-mono text-emerald-400">{act.riskLevel}</span>
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{act.description}</p>

                      {act.commandOrPayload && (
                        <div className="p-2 rounded bg-slate-950 font-mono text-[11px] text-emerald-400 border border-slate-800 flex items-center gap-2">
                          <Terminal className="h-3.5 w-3.5 shrink-0 text-slate-500" />
                          <span className="truncate">{act.commandOrPayload}</span>
                        </div>
                      )}

                      {/* Controlled Action Dispatch Buttons */}
                      <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800/60">
                        <button
                          disabled={actionLoadingId !== null}
                          onClick={() => handleRunDryRun(act)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 border border-slate-700"
                        >
                          {isDryRunning ? (
                            <Loader2 className="h-3 w-3 animate-spin text-cyan-400" />
                          ) : (
                            <Eye className="h-3 w-3 text-cyan-400" />
                          )}
                          Dry-Run Simulation
                        </button>

                        <button
                          disabled={actionLoadingId !== null || (policy ? !policy.autonomousRemediationEnabled : false)}
                          onClick={() => handleRunExecute(act)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold transition-colors disabled:opacity-50 flex items-center gap-1.5 shadow-lg shadow-emerald-600/20"
                        >
                          {isExecuting ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Play className="h-3 w-3" />
                          )}
                          Execute Remediation
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Verification Probes */}
              <div className="space-y-2 pt-2 border-t border-slate-800/80">
                <div className="text-xs font-semibold text-slate-400 uppercase flex items-center gap-1.5">
                  <FileCheck className="h-3.5 w-3.5 text-emerald-400" /> Post-Execution Verification Probes:
                </div>
                {analysis.verify.postExecutionVerificationProbes.map((probe, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800 text-xs">
                    <span className="font-mono text-slate-300 text-[11px]">{probe.metricOrEndpoint}</span>
                    <span className="text-emerald-400 font-mono text-[11px] font-semibold">{probe.expectedCondition}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Executions & Closed-Loop Telemetry Trail */}
      {actionsHistory.length > 0 && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              Remediation Action Executions & Closed-Loop Verification Trail
            </h3>
            <span className="text-xs text-slate-400 font-mono">
              {actionsHistory.length} Recorded Action{actionsHistory.length > 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-3">
            {actionsHistory.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-white text-xs">{item.actionType}</span>
                    {item.targetServiceName && (
                      <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded font-mono">
                        {item.targetServiceName}
                      </span>
                    )}
                    {executionStatusBadge(item.status, item.isDryRun)}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[11px] text-slate-500 font-mono">
                      {new Date(item.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>

                    <button
                      onClick={() => setModalExecution(item)}
                      className="px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] font-mono text-slate-300 border border-slate-700 transition-colors"
                    >
                      View Details
                    </button>

                    {item.status === 'PENDING_APPROVAL' && isOperator && (
                      <button
                        disabled={actionLoadingId !== null}
                        onClick={() => handleApproveAction(item.id)}
                        className="px-2.5 py-1 rounded bg-amber-600 hover:bg-amber-500 text-[11px] font-semibold text-white transition-colors flex items-center gap-1"
                      >
                        {actionLoadingId === `approve-${item.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <CheckCircle className="h-3 w-3" />
                        )}
                        Approve & Execute
                      </button>
                    )}

                    {!item.isDryRun && item.status === 'SUCCEEDED' && item.rollbackStatus !== 'EXECUTED' && isOperator && (
                      <button
                        disabled={actionLoadingId !== null}
                        onClick={() => handleRollbackAction(item.id)}
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-rose-950/40 text-slate-400 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 text-[11px] font-semibold transition-colors flex items-center gap-1"
                      >
                        {actionLoadingId === `rollback-${item.id}` ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3 w-3" />
                        )}
                        Rollback
                      </button>
                    )}
                  </div>
                </div>

                {/* Probes summary */}
                {item.verificationResults && item.verificationResults.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-800/60">
                    {item.verificationResults.map((probe, pIdx) => (
                      <div
                        key={pIdx}
                        className={`p-2 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                          probe.passed
                            ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                            : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 truncate">
                          {probe.passed ? (
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                          ) : (
                            <XCircle className="h-3.5 w-3.5 text-rose-400 shrink-0" />
                          )}
                          <span className="font-mono text-[11px] truncate">{probe.probe}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0">{probe.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

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

        {/* Right Column: AI Recommended SOPs & Activity Stream */}
        <div className="lg:col-span-2 space-y-6">
          {/* AI Recommended SOPs Widget */}
          <div className="bg-slate-900 border border-indigo-500/30 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-indigo-400" />
                <h3 className="text-sm font-bold text-white">AI Recommended SOPs & Runbooks</h3>
              </div>
              <span className="text-[11px] text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded font-mono font-medium">
                RAG Matched
              </span>
            </div>

            {isLoadingSops ? (
              <div className="py-6 flex justify-center items-center text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin text-indigo-500" />
              </div>
            ) : recommendedSops.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-500 text-center">
                No matching SOP runbooks found in your knowledge base for this incident.
              </div>
            ) : (
              <div className="space-y-3">
                {recommendedSops.map((sop) => (
                  <div
                    key={sop.documentId}
                    className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-indigo-400" />
                        <span className="text-sm font-bold text-white">{sop.title}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                          {Math.round(sop.relevanceScore * 100)}% Match
                        </span>
                        <Link
                          href={`/app/sops/${sop.documentId}`}
                          target="_blank"
                          className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
                        >
                          View <ExternalLink className="h-3 w-3" />
                        </Link>
                      </div>
                    </div>

                    {sop.remediationSteps.length > 0 && (
                      <div className="space-y-1.5 pt-2 border-t border-slate-800/60">
                        <div className="text-[11px] font-semibold text-slate-400 uppercase">
                          Action Steps:
                        </div>
                        <div className="space-y-1">
                          {sop.remediationSteps.map((step, idx) => (
                            <div key={idx} className="flex items-start gap-2 text-xs text-slate-200">
                              <CheckSquare className="h-3.5 w-3.5 text-indigo-400 shrink-0 mt-0.5" />
                              <span>{step}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Activity Stream & Note Composer */}
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

      {/* Execution / Dry-Run Details Modal */}
      {modalExecution && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-6 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <Terminal className="h-5 w-5 text-indigo-400" />
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>{modalExecution.actionType}</span>
                    {executionStatusBadge(modalExecution.status, modalExecution.isDryRun)}
                  </h3>
                  <span className="text-xs text-slate-400 font-mono">
                    ID: {modalExecution.id.slice(0, 8)} • Executed at {new Date(modalExecution.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                onClick={() => setModalExecution(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Precondition Checks */}
            {modalExecution.preconditionChecks && modalExecution.preconditionChecks.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Precondition Gate Validations:
                </h4>
                <div className="space-y-1.5">
                  {modalExecution.preconditionChecks.map((check, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                        check.passed
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {check.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                        )}
                        <span>{check.check}</span>
                      </div>
                      <span className="font-mono text-[11px] font-bold">
                        {check.passed ? 'PASSED' : 'FAILED'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verification Probes */}
            {modalExecution.verificationResults && modalExecution.verificationResults.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Closed-Loop Telemetry Verification Probes:
                </h4>
                <div className="space-y-1.5">
                  {modalExecution.verificationResults.map((probe, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border text-xs flex items-center justify-between ${
                        probe.passed
                          ? 'bg-emerald-950/20 border-emerald-500/30 text-emerald-300'
                          : 'bg-rose-950/20 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {probe.passed ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
                        )}
                        <span className="font-mono">{probe.probe}</span>
                      </div>
                      <span className="text-slate-400 text-[11px]">{probe.message}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Execution Output */}
            {modalExecution.executionOutput && (
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Execution Output Payload:
                </h4>
                <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-300 overflow-x-auto">
                  {JSON.stringify(modalExecution.executionOutput, null, 2)}
                </pre>
              </div>
            )}

            {/* Parameters */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                Action Parameters:
              </h4>
              <pre className="p-3 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-slate-400 overflow-x-auto">
                {JSON.stringify(modalExecution.parameters, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setModalExecution(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-semibold transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}