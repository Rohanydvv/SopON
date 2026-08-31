'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { fetchApi } from '@/lib/api';
import {
  MemberResponse,
  UserRole,
  CreateInvitationRequest,
} from '@sopon/contracts';
import {
  Users,
  UserPlus,
  Shield,
  Trash2,
  Loader2,
  Copy,
  Check,
  AlertCircle,
  X,
} from 'lucide-react';

export default function MembersPage() {
  const { activeOrg, token, user } = useAuth();
  const [members, setMembers] = useState<MemberResponse[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Invite modal state
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.ENGINEER);
  const [isInviting, setIsInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Load members
  const loadMembers = async () => {
    if (!activeOrg || !token) return;
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetchApi<MemberResponse[]>(
        `/v1/organizations/${activeOrg.organizationId}/members`,
        {},
        token,
      );
      setMembers(res.data);
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String(err.message));
      } else {
        setError('Failed to load team members');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [activeOrg?.organizationId, token]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrg || !token) return;
    setInviteError(null);
    setIsInviting(true);

    try {
      const payload: CreateInvitationRequest = {
        email: inviteEmail.trim(),
        role: inviteRole,
      };

      const res = await fetchApi<{ id: string; inviteToken: string }>(
        `/v1/organizations/${activeOrg.organizationId}/invitations`,
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
        token,
      );

      const link = `${window.location.origin}/invitations/${res.data.inviteToken}`;
      setGeneratedInviteLink(link);
      setInviteEmail('');
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setInviteError(String(err.message));
      } else {
        setInviteError('Failed to send invitation');
      }
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: UserRole) => {
    if (!activeOrg || !token) return;

    try {
      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/members/${memberId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: newRole }),
        },
        token,
      );
      await loadMembers();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    }
  };

  const handleRemoveMember = async (memberId: string, memberName: string) => {
    if (!activeOrg || !token) return;
    if (!confirm(`Are you sure you want to remove ${memberName} from this organization?`)) {
      return;
    }

    try {
      await fetchApi(
        `/v1/organizations/${activeOrg.organizationId}/members/${memberId}`,
        {
          method: 'DELETE',
        },
        token,
      );
      await loadMembers();
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        alert(String(err.message));
      }
    }
  };

  const canManageMembers = activeOrg?.role === UserRole.OWNER || activeOrg?.role === UserRole.ADMIN;

  const roleBadge = (role: UserRole) => {
    const styles: Record<UserRole, string> = {
      [UserRole.OWNER]: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
      [UserRole.ADMIN]: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
      [UserRole.MANAGER]: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
      [UserRole.ENGINEER]: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
      [UserRole.VIEWER]: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
    };

    return (
      <span className={`px-2 py-0.5 rounded text-xs font-semibold uppercase border ${styles[role]}`}>
        {role}
      </span>
    );
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight flex items-center gap-2.5">
            <Users className="h-6 w-6 text-indigo-400" />
            Team & Members
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Manage who has access to {activeOrg?.organizationName} and configure their authorization roles.
          </p>
        </div>

        {canManageMembers && (
          <button
            onClick={() => {
              setGeneratedInviteLink(null);
              setIsInviteModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors shadow-lg shadow-indigo-600/20"
          >
            <UserPlus className="h-4 w-4" />
            Invite Member
          </button>
        )}
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-center gap-3">
          <AlertCircle className="h-5 w-5" />
          <span>{error}</span>
        </div>
      )}

      {/* Members Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl">
        {isLoading ? (
          <div className="p-12 flex justify-center items-center text-slate-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-800/60 text-slate-400 text-xs uppercase font-semibold border-b border-slate-800">
                <tr>
                  <th className="py-3 px-6">Member</th>
                  <th className="py-3 px-6">Role</th>
                  <th className="py-3 px-6">Status</th>
                  <th className="py-3 px-6">Joined Date</th>
                  {canManageMembers && <th className="py-3 px-6 text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {members.map((m) => {
                  const isSelf = m.userId === user?.id;
                  return (
                    <tr key={m.id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-xs text-indigo-400 uppercase">
                            {m.name.charAt(0)}
                          </div>
                          <div>
                            <div className="font-medium text-white flex items-center gap-2">
                              {m.name}
                              {isSelf && (
                                <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">
                                  You
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-400">{m.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6">
                        {canManageMembers && !isSelf && m.role !== UserRole.OWNER ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.id, e.target.value as UserRole)}
                            className="bg-slate-950 border border-slate-700 rounded px-2.5 py-1 text-xs text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                          >
                            <option value={UserRole.ADMIN}>ADMIN</option>
                            <option value={UserRole.MANAGER}>MANAGER</option>
                            <option value={UserRole.ENGINEER}>ENGINEER</option>
                            <option value={UserRole.VIEWER}>VIEWER</option>
                          </select>
                        ) : (
                          roleBadge(m.role)
                        )}
                      </td>
                      <td className="py-4 px-6">
                        <span className="inline-flex items-center gap-1.5 text-xs text-emerald-400">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                          {m.status}
                        </span>
                      </td>
                      <td className="py-4 px-6 text-xs text-slate-400">
                        {new Date(m.createdAt).toLocaleDateString()}
                      </td>
                      {canManageMembers && (
                        <td className="py-4 px-6 text-right">
                          {!isSelf && m.role !== UserRole.OWNER && (
                            <button
                              onClick={() => handleRemoveMember(m.id, m.name)}
                              className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Remove Member"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite Member Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
            <button
              onClick={() => setIsInviteModalOpen(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <h2 className="text-xl font-bold text-white mb-1">Invite Team Member</h2>
            <p className="text-sm text-slate-400 mb-6">
              Send an invitation to join <strong className="text-white">{activeOrg?.organizationName}</strong>.
            </p>

            {inviteError && (
              <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs">
                {inviteError}
              </div>
            )}

            {generatedInviteLink ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                  Invitation created successfully! Share this link with the invitee:
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={generatedInviteLink}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-slate-200 text-xs font-mono select-all"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(generatedInviteLink);
                      setCopiedLink(true);
                      setTimeout(() => setCopiedLink(false), 2000);
                    }}
                    className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors shrink-0"
                    title="Copy Link"
                  >
                    {copiedLink ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                  </button>
                </div>

                <div className="flex justify-end mt-4">
                  <button
                    onClick={() => {
                      setIsInviteModalOpen(false);
                      setGeneratedInviteLink(null);
                      loadMembers();
                    }}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleInvite} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Colleague&apos;s Work Email
                  </label>
                  <input
                    type="email"
                    required
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@company.com"
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Assigned Role
                  </label>
                  <select
                    value={inviteRole}
                    onChange={(e) => setInviteRole(e.target.value as UserRole)}
                    className="w-full px-4 py-2 bg-slate-950 border border-slate-800 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value={UserRole.ADMIN}>ADMIN (Full team management & settings)</option>
                    <option value={UserRole.MANAGER}>MANAGER (Incident & runbook management)</option>
                    <option value={UserRole.ENGINEER}>ENGINEER (Incident response & execution)</option>
                    <option value={UserRole.VIEWER}>VIEWER (Read-only observation)</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 mt-6">
                  <button
                    type="button"
                    onClick={() => setIsInviteModalOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isInviting}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {isInviting && <Loader2 className="h-4 w-4 animate-spin" />}
                    Generate Invitation
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}