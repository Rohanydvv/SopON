'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  AuthResponseData,
  AuthSessionUser,
  UserOrganizationMembership,
  UserRole,
} from '@sopon/contracts';
import { fetchApi } from './api';

interface AuthContextType {
  user: AuthSessionUser | null;
  memberships: UserOrganizationMembership[];
  activeOrg: UserOrganizationMembership | null;
  token: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, organizationName: string) => Promise<void>;
  logout: () => void;
  switchOrganization: (orgId: string) => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthSessionUser | null>(null);
  const [memberships, setMemberships] = useState<UserOrganizationMembership[]>([]);
  const [activeOrgId, setActiveOrgId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Load persisted auth from localStorage on mount
    try {
      const storedToken = localStorage.getItem('sopon_token');
      const storedUser = localStorage.getItem('sopon_user');
      const storedMemberships = localStorage.getItem('sopon_memberships');
      const storedActiveOrgId = localStorage.getItem('sopon_active_org_id');

      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        if (storedMemberships) {
          const parsedMemberships: UserOrganizationMembership[] = JSON.parse(storedMemberships);
          setMemberships(parsedMemberships);
          setActiveOrgId(storedActiveOrgId || parsedMemberships[0]?.organizationId || null);
        }
      }
    } catch (e) {
      console.error('Failed to load stored auth session', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const activeOrg =
    memberships.find((m) => m.organizationId === activeOrgId) || memberships[0] || null;

  const handleAuthSuccess = (data: AuthResponseData) => {
    setUser(data.user);
    setMemberships(data.memberships);
    setActiveOrgId(data.activeOrganizationId || data.memberships[0]?.organizationId || null);
    setToken(data.tokens.accessToken);

    localStorage.setItem('sopon_token', data.tokens.accessToken);
    localStorage.setItem('sopon_refresh_token', data.tokens.refreshToken);
    localStorage.setItem('sopon_user', JSON.stringify(data.user));
    localStorage.setItem('sopon_memberships', JSON.stringify(data.memberships));
    if (data.activeOrganizationId) {
      localStorage.setItem('sopon_active_org_id', data.activeOrganizationId);
    }

    router.push('/app');
  };

  const login = async (email: string, password: string) => {
    const res = await fetchApi<AuthResponseData>('/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    handleAuthSuccess(res.data);
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    organizationName: string,
  ) => {
    const res = await fetchApi<AuthResponseData>('/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, organizationName }),
    });

    handleAuthSuccess(res.data);
  };

  const logout = () => {
    setUser(null);
    setMemberships([]);
    setActiveOrgId(null);
    setToken(null);

    localStorage.removeItem('sopon_token');
    localStorage.removeItem('sopon_refresh_token');
    localStorage.removeItem('sopon_user');
    localStorage.removeItem('sopon_memberships');
    localStorage.removeItem('sopon_active_org_id');

    router.push('/login');
  };

  const switchOrganization = (orgId: string) => {
    const found = memberships.find((m) => m.organizationId === orgId);
    if (found) {
      setActiveOrgId(orgId);
      localStorage.setItem('sopon_active_org_id', orgId);
    }
  };

  const refreshUserData = async () => {
    if (!token) return;
    try {
      const res = await fetchApi<{ user: AuthSessionUser; memberships: UserOrganizationMembership[] }>(
        '/v1/me',
        {},
        token,
      );
      setUser(res.data.user);
      setMemberships(res.data.memberships);
      localStorage.setItem('sopon_user', JSON.stringify(res.data.user));
      localStorage.setItem('sopon_memberships', JSON.stringify(res.data.memberships));
    } catch (e) {
      console.error('Failed to refresh user data', e);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        memberships,
        activeOrg,
        token,
        isLoading,
        login,
        register,
        logout,
        switchOrganization,
        refreshUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}