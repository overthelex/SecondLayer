import { useState, useEffect, useCallback } from 'react';
import { api } from '@/utils/api-client';
import { getToken, getUser, setAuth, clearAuth, type User } from '@/utils/auth';

export function useAuth() {
  const [user, setUser] = useState<User | null>(getUser());
  const [loading, setLoading] = useState(true);

  const validateToken = useCallback(async () => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const { data } = await api.get('/auth/me');
      if (data.user) {
        setAuth(token, data.user);
        setUser(data.user);
      }
    } catch {
      clearAuth();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    validateToken();
  }, [validateToken]);

  const logout = useCallback(() => {
    clearAuth();
    setUser(null);
    window.location.href = '/login';
  }, []);

  return {
    user,
    loading,
    isAuthenticated: !!user,
    logout,
  };
}
