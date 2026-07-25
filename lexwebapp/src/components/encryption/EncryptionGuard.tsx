/**
 * EncryptionGuard
 * Auto-checks encryption status after authentication and prompts setup/unlock.
 * Placed inside AuthProvider so it has access to auth state.
 *
 * Flow:
 * 1. User logs in → checkStatus() called
 * 2. If no encryption → show setup dialog
 * 3. If has encryption but locked → try sessionStorage restore first, then show unlock dialog
 * 4. After unlock → private key persisted in sessionStorage for page-refresh recovery
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useEncryptionStore } from '../../stores/encryptionStore';
import { EncryptionSetupDialog } from './EncryptionSetupDialog';

export function EncryptionGuard() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const {
    hasEncryption,
    isUnlocked,
    statusChecked,
    checkStatus,
    trySessionRestore,
  } = useEncryptionStore();

  const [showDialog, setShowDialog] = useState(false);
  const [dialogMode, setDialogMode] = useState<'setup' | 'unlock'>('setup');
  // Track if user explicitly dismissed the dialog (don't re-show until next session)
  const [dismissed, setDismissed] = useState(false);

  // Step 1: After auth is ready, check encryption status + try session restore
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;

    const init = async () => {
      // Try session restore first (instant, no password needed)
      const restored = await trySessionRestore();
      if (restored) return;

      // If session restore failed, check server status
      await checkStatus();
    };

    init();
  }, [isAuthenticated, authLoading, checkStatus, trySessionRestore]);

  // Step 2: After status check, decide whether to show dialog
  useEffect(() => {
    if (!isAuthenticated || !statusChecked || isUnlocked || dismissed) return;

    if (!hasEncryption) {
      // New user — prompt to set up encryption
      setDialogMode('setup');
      setShowDialog(true);
    } else {
      // Returning user with locked keys — prompt to unlock
      setDialogMode('unlock');
      setShowDialog(true);
    }
  }, [isAuthenticated, statusChecked, hasEncryption, isUnlocked, dismissed]);

  // Auto-hide dialog when unlocked (e.g. after successful setup/unlock)
  useEffect(() => {
    if (isUnlocked && showDialog) {
      setShowDialog(false);
    }
  }, [isUnlocked, showDialog]);

  // Reset dismissed state on logout
  useEffect(() => {
    if (!isAuthenticated) {
      setDismissed(false);
      setShowDialog(false);
    }
  }, [isAuthenticated]);

  const handleClose = () => {
    setDismissed(true);
    setShowDialog(false);
  };

  return (
    <EncryptionSetupDialog
      isOpen={showDialog}
      onClose={handleClose}
      mode={dialogMode}
    />
  );
}
