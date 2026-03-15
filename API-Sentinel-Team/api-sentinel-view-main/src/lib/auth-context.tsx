import React, { createContext, useContext, useState, useEffect } from 'react';
import { post, get, setToken, getToken, ApiError } from './api-client';

function friendlyError(err: unknown, action: 'login' | 'signup'): string {
  if (err instanceof ApiError) {
    const body = err.body as { detail?: string | { msg: string }[] } | null;
    if (typeof body?.detail === 'string') return body.detail;
    if (Array.isArray(body?.detail)) {
      return body!.detail.map((d: { msg: string }) => d.msg).join(', ');
    }
    if (err.status === 401) return 'Incorrect email or password.';
    if (err.status === 409) return 'An account with this email already exists.';
    if (err.status === 422) return action === 'signup' ? 'Please fill all fields correctly.' : 'Invalid email or password format.';
    if (err.status === 429) return 'Too many attempts. Please wait a minute.';
  }
  return 'Network error - is the backend running?';
}

export type UserRole = 'ADMIN' | 'MEMBER' | 'GUEST';

export interface User {
  login: string;
  name?: string;
  role: UserRole;
  accounts?: Record<string, unknown>;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  error: string | null;
  isAdmin: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string) => Promise<void>;
  // signup derives account_name from email prefix
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const DEFAULT_ADMIN: User = {
  login: 'admin@sentinel.io',
  name: 'Admin',
  role: 'ADMIN',
  accounts: { '1000000': { accountId: 1000000, name: 'Helios', isDefault: true } },
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    get<{ email?: string; role?: string; account_id?: number }>('/auth/me')
      .then(profile => {
        if (profile?.email) {
          setUser({
            login: profile.email,
            name: profile.email.split('@')[0],
            role: (profile.role as UserRole) ?? 'ADMIN',
            accounts: { [String(profile.account_id ?? 1000000)]: { accountId: profile.account_id ?? 1000000, name: 'My Org', isDefault: true } },
          });
        } else {
          setToken(null);
          setUser(null);
        }
      })
      .catch(() => { setToken(null); setUser(null); })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const res = await post<{ access_token?: string; role?: string }>('/auth/login', { email, password });
      if (res.access_token) {
        setToken(res.access_token);
      }
      const profile = await get<{ email?: string; role?: string; account_id?: number }>('/auth/me');
      if (profile.email) {
        setUser({
          login: profile.email,
          name: profile.email.split('@')[0],
          role: (profile.role as UserRole) ?? 'ADMIN',
          accounts: { [String(profile.account_id ?? 1000000)]: { accountId: profile.account_id ?? 1000000, name: 'My Org', isDefault: true } },
        });
      }
    } catch (err) {
      throw new Error(friendlyError(err, 'login'));
    }
  };

  const signup = async (email: string, password: string) => {
    try {
      const accountName = email.split('@')[0] || 'My Org';
      const res = await post<{ access_token?: string; role?: string }>('/auth/signup', { email, password, account_name: accountName });
      if (res.access_token) {
        setToken(res.access_token);
      }
      const profile = await get<{ email?: string; role?: string; account_id?: number }>('/auth/me');
      if (profile.email) {
        setUser({
          login: profile.email,
          name: profile.email.split('@')[0],
          role: (profile.role as UserRole) ?? 'ADMIN',
          accounts: { [String(profile.account_id ?? 1000000)]: { accountId: profile.account_id ?? 1000000, name: accountName, isDefault: true } },
        });
      }
    } catch (err) {
      throw new Error(friendlyError(err, 'signup'));
    }
  };
  const logout = () => {
    setToken(null);
    setUser(null);
    window.location.href = '/';
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, error: null, isAdmin: user?.role === 'ADMIN', login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
