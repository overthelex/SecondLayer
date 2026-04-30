/**
 * AccessGateBootstrap
 *
 * On every transition into an authenticated session, fetches the
 * beta-restriction status so the modal can show proactively (without
 * waiting for chat / upload to fail with 403).
 *
 * Resets the store on logout so a logged-out user does not retain a stale
 * "restricted" flag from a previous account.
 */

import { useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useAccessGateStore } from '../../stores/accessGateStore';

export const AccessGateBootstrap: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const fetchAccessStatus = useAccessGateStore((s) => s.fetchAccessStatus);
  const reset = useAccessGateStore((s) => s.reset);

  useEffect(() => {
    if (isLoading) return;
    if (isAuthenticated) {
      void fetchAccessStatus();
    } else {
      reset();
    }
  }, [isAuthenticated, isLoading, fetchAccessStatus, reset]);

  return null;
};

export default AccessGateBootstrap;
