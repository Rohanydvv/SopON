'use client';

import React from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import {
  Building2,
  Users,
  ShieldCheck,
  ArrowRight,
  Activity,
  Server,
  Zap,
} from 'lucide-react';

export default function OverviewPage() {
  const { user, activeOrg } = useAuth();

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome Hero Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-indigo-950 via-slate-900 to-slate-900 border border-indigo-500/20 p-8 shadow-xl">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-4">
            <Zap className="h-3.5 w-3.5" />
            Phase 1 Foundation Active
          </span>
          <h1 className="text-3xl font-bold text-white tracking-tight">
            Welcome, {user?.name}
          </h1>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed">
            You are operating within{' '}
            <strong className="text-slate-200">{activeOrg?.organizationName}</strong> as an{' '}
            <strong className="text-indigo-400 uppercase">{activeOrg?.role}</strong>. Your tenant context
            and role-based permissions are enforced server-side.
          </p>

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Link
              href="/app/settings/members"
              className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
            >
              <Users className="h-4 w-4" />
              Manage Team & Roles
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* Tenant Context Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Active Organization
            </span>
            <Building2 className="h-5 w-5 text-indigo-400" />
          </div>
          <div className="mt-4">
            <div className="text-xl font-bold text-white">{activeOrg?.organizationName}</div>
            <div className="text-xs text-slate-400 font-mono mt-0.5">slug: {activeOrg?.organizationSlug}</div>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Your RBAC Role
            </span>
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
          </div>
          <div className="mt-4">
            <div className="text-xl font-bold text-white uppercase">{activeOrg?.role}</div>
            <div className="text-xs text-slate-400 mt-0.5">Full multi-tenant server verification</div>
          </div>
        </div>

        <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              System Environment
            </span>
            <Server className="h-5 w-5 text-purple-400" />
          </div>
          <div className="mt-4">
            <div className="text-xl font-bold text-white">PostgreSQL + pgvector</div>
            <div className="text-xs text-slate-400 mt-0.5">Multi-tenant schema active</div>
          </div>
        </div>
      </div>
    </div>
  );
}