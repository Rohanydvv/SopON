'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchApi } from '@/lib/api';
import { AuthResponseData, InvitationResponse } from '@sopon/contracts';
import { ShieldCheck, AlertCircle, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { login } = useAuth();
  const token = typeof params.token === 'string' ? params.token : '';

  const [invitation, setInvitation] = useState<InvitationResponse | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;

    fetchApi<InvitationResponse>(`/v1/invitations/${token}`)
      .then((res) => {
        setInvitation(res.data);
      })
      .catch((err) => {
        setError(err.message || 'Invitation is invalid or has expired.');
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [token]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const res = await fetchApi<AuthResponseData>('/v1/invitations/accept', {
        method: 'POST',
        body: JSON.stringify({
          token,
          name: name.trim() || undefined,
          password: password || undefined,
        }),
      });

      localStorage.setItem('sopon_token', res.data.tokens.accessToken);
      localStorage.setItem('sopon_refresh_token', res.data.tokens.refreshToken);
      localStorage.setItem('sopon_user', JSON.stringify(res.data.user));
      localStorage.setItem('sopon_memberships', JSON.stringify(res.data.memberships));
      localStorage.setItem('sopon_active_org_id', res.data.activeOrganizationId);

      window.location.href = '/app';
    } catch (err: unknown) {
      if (typeof err === 'object' && err !== null && 'message' in err) {
        setError(String(err.message));
      } else {
        setError('Failed to accept invitation.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-400">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex flex-col items-center text-center mb-8">
          <div className="h-12 w-12 rounded-xl bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center mb-4 text-indigo-400">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Organization Invitation</h1>
          {invitation && (
            <p className="text-slate-400 text-sm mt-1">
              You have been invited to join{' '}
              <span className="text-white font-medium">{invitation.organizationName}</span> as an{' '}
              <span className="text-indigo-400 font-semibold">{invitation.role}</span>.
            </p>
          )}
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm flex items-start gap-3">
            <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {invitation && (
          <form onSubmit={handleAccept} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Invited Email
              </label>
              <input
                type="text"
                disabled
                value={invitation.email}
                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-800 rounded-lg text-slate-400 text-sm cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Your Full Name
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Charlie Brown"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Set Password (min 8 characters)
              </label>
              <input
                type="password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition-colors flex items-center justify-center gap-2 shadow-lg shadow-indigo-600/20 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Joining Organization...
                </>
              ) : (
                <>
                  Accept & Join Organization
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}