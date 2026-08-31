'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  ShieldCheck,
  Building2,
  Users,
  AlertTriangle,
  Server,
  LogOut,
  ChevronDown,
  Plus,
  Loader2,
  Check,
  Layers,
  Radio,
} from 'lucide-react';
import { fetchApi } from '@/lib/api';
import { OrganizationResponse, UserRole } from '@sopon/contracts';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, memberships, activeOrg, token, isLoading, logout, switchOrganization, refreshUserData } =
    useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [isOrgDropdownOpen, setIsOrgDropdownOpen] = useState(false);
  const [isCreateOrgModalOpen, setIsCreateOrgModalOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState('');
  const [isCreatingOrg, setIsCreatingOrg] = useState(false);
  const [createOrgError, setCreateOrgError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && (!token || !user)) {
      router.push('/login');
    }
  }, [isLoading, token, user, router]);

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setCreateOrgError(null);
    setIsCreatingOrg(true);

    try {
      const res = await fetchApi<OrganizationResponse>(
        '/v1/organizations',
        {
          method: 'POST',
          body: JSON.stringify({ name: newOrgName }),
        },
        token,
      );

      await refreshUserData();
      switchOrganization(res.data.id);
      setIsCreateOrgModalOpen(false);
      setNewOrgName('');
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setCreateOrgError(String(err.message));
      } else {
        setCreateOrgError('Failed to create organization');
      }
    } finally {
      setIsCreatingOrg(false);
    }
  };

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  const roleColors: Record<UserRole, string> = {
    [UserRole.OWNER]: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
    [UserRole.ADMIN]: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    [UserRole.MANAGER]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    [UserRole.ENGINEER]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    [UserRole.VIEWER]: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
  };

  const navItems = [
    { label: 'Overview', href: '/app', icon: Layers },
    { label: 'Incidents', href: '/app/incidents', icon: AlertTriangle },
    { label: 'Services Catalog', href: '/app/services', icon: Server },
    { label: 'Team Members', href: '/app/settings/members', icon: Users },
    { label: 'Integrations', href: '/app/settings/integrations', icon: Radio },
  ];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col">
      {/* Top Navigation Bar */}
      <header className="h-16 border-b border-slate-800 bg-slate-900/80 backdrop-blur px-6 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-6">
          <Link href="/app" className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/30">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="font-bold text-lg text-white tracking-tight">SopON</span>
          </Link>

          <div className="h-5 w-px bg-slate-800" />

          {/* Organization Switcher Dropdown */}
          <div className="relative">
            <button
              onClick={() => setIsOrgDropdownOpen(!isOrgDropdownOpen)}
              className="flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 border border-slate-700/60 text-sm text-slate-200 transition-colors"
            >
              <Building2 className="h-4 w-4 text-indigo-400" />
              <span className="font-medium">{activeOrg?.organizationName || 'Select Org'}</span>
              {activeOrg && (
                <span
                  className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${
                    roleColors[activeOrg.role]
                  }`}
                >
                  {activeOrg.role}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-slate-400 ml-1" />
            </button>

            {isOrgDropdownOpen && (
              <div
                className="absolute top-full left-0 mt-2 w-64 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-2 z-50 animate-in fade-in slide-in-from-top-1"
                onMouseLeave={() => setIsOrgDropdownOpen(false)}
              >
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-2.5 py-1.5">
                  Organizations
                </div>
                <div className="space-y-1 mb-2">
                  {memberships.map((m) => (
                    <button
                      key={m.organizationId}
                      onClick={() => {
                        switchOrganization(m.organizationId);
                        setIsOrgDropdownOpen(false);
                      }}
                      className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-sm text-left hover:bg-slate-800/80 transition-colors text-slate-200"
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-white">{m.organizationName}</span>
                        <span className="text-xs text-slate-400">{m.organizationSlug}</span>
                      </div>
                      {m.organizationId === activeOrg?.organizationId && (
                        <Check className="h-4 w-4 text-indigo-400 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="h-px bg-slate-800 my-1" />

                <button
                  onClick={() => {
                    setIsOrgDropdownOpen(false);
                    setIsCreateOrgModalOpen(true);
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-medium text-indigo-400 hover:bg-indigo-600/10 transition-colors"
                >
                  <Plus className="h-4 w-4" />
                  Create New Organization
                </button>
              </div>
            )}
          </div>
        </div>

        {/* User Profile & Logout */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-400 uppercase">
              {user.name.charAt(0)}
            </div>
            <div className="hidden sm:flex flex-col text-left">
              <span className="text-xs font-semibold text-white leading-tight">{user.name}</span>
              <span className="text-[11px] text-slate-400 leading-tight">{user.email}</span>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* Main Content Area with Sidebar */}
      <div className="flex-1 flex">
        {/* Left Navigation Sidebar */}
        <aside className="w-60 border-r border-slate-800 bg-slate-900/40 p-4 shrink-0 hidden md:block">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-3 mb-2">
            Operations
          </div>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href || (item.href !== '/app' && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-8 overflow-y-auto">{children}</main>
      </div>

      {/* Create Organization Modal */}
      {isCreateOrgModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-white mb-1">Create Organization</h2>
            <p className="text-sm text-slate-400 mb-6">
              Create an isolated organization workspace with its own team, services, and policies.
            </p>

            {createOrgError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {createOrgError}
              </div>
            )}

            <form onSubmit={handleCreateOrg} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                  Organization Name
                </label>
                <input
                  type="text"
                  required
                  value={newOrgName}
                  onChange={(e) => setNewOrgName(e.target.value)}
                  placeholder="Engineering SRE Team"
                  className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => setIsCreateOrgModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingOrg}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isCreatingOrg && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}