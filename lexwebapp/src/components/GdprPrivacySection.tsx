import { useState, useEffect } from 'react';
import { Shield, Download, Trash2, Loader2, AlertTriangle, CheckCircle, Cookie } from 'lucide-react';
import { api } from '../utils/api-client';
import showToast from '../utils/toast';
import { toastT } from '../i18n/toast-i18n';
import { useConsentStore } from '../stores/consentStore';
import { useMiscT } from '../i18n/misc-i18n';

interface GdprRequest {
  id: string;
  request_type: string;
  status: string;
  requested_at: string;
  completed_at?: string;
}

export function GdprPrivacySection() {
  const { t } = useMiscT();
  const [requests, setRequests] = useState<GdprRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    loadRequests();
  }, []);

  async function loadRequests() {
    try {
      const response = await api.gdpr.listRequests();
      setRequests(response.data.requests || []);
    } catch {
      // silent
    }
  }

  async function handleExport() {
    setExporting(true);
    try {
      const response = await api.gdpr.requestExport();
      showToast.success(toastT('dataExportRequested'));
      setRequests((prev) => [response.data, ...prev]);
    } catch {
      showToast.error(toastT('dataExportRequestFailed'));
    } finally {
      setExporting(false);
    }
  }

  async function handleDownloadExport(requestId: string) {
    setLoading(true);
    try {
      const response = await api.gdpr.getExport(requestId);
      const data = response.data;

      if (data.status === 'completed' && data.data) {
        const blob = new Blob([JSON.stringify(data.data, null, 2)], {
          type: 'application/json',
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `my-data-export-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast.success(toastT('dataDownloaded'));
      } else if (data.status === 'processing') {
        showToast.info(toastT('exportStillProcessing'));
      } else {
        showToast.error(toastT('exportNotAvailable'));
      }
    } catch {
      showToast.error(toastT('exportDownloadFailed'));
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleting(true);
    try {
      await api.gdpr.requestDeletion('DELETE MY ACCOUNT');
      showToast.success(toastT('accountDeletionInitiated'));
      setShowDeleteConfirm(false);
      // Logout after short delay
      setTimeout(() => {
        localStorage.removeItem('auth_token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }, 2000);
    } catch {
      showToast.error(toastT('accountDeletionFailed'));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-4">
        <Shield size={20} className="text-claude-accent" />
        <h3 className="text-lg font-semibold text-claude-text font-sans">
          {t('gdprTitle')}
        </h3>
      </div>

      {/* Export Data */}
      <div className="p-4 bg-white rounded-xl border border-claude-border">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-[14px] font-medium text-claude-text font-sans">
              {t('exportMyData')}
            </h4>
            <p className="text-[12px] text-claude-subtext mt-1 font-sans">
              {t('exportMyDataDesc')}
            </p>
          </div>
          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-claude-bg hover:bg-claude-border/50 border border-claude-border rounded-lg transition-colors disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Download size={14} />
            )}
            {t('export')}
          </button>
        </div>
      </div>

      {/* Previous exports */}
      {requests.filter((r) => r.request_type === 'export').length > 0 && (
        <div className="space-y-2">
          <h4 className="text-[12px] font-semibold text-claude-subtext uppercase tracking-wider font-sans px-1">
            {t('previousExports')}
          </h4>
          {requests
            .filter((r) => r.request_type === 'export')
            .slice(0, 5)
            .map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 bg-white rounded-lg border border-claude-border/50"
              >
                <div className="flex items-center gap-2">
                  {r.status === 'completed' ? (
                    <CheckCircle size={14} className="text-green-500" />
                  ) : (
                    <Loader2 size={14} className="text-claude-subtext animate-spin" />
                  )}
                  <span className="text-[13px] text-claude-text font-sans">
                    {new Date(r.requested_at).toLocaleDateString()}
                  </span>
                  <span className="text-[11px] text-claude-subtext font-sans">
                    {r.status}
                  </span>
                </div>
                {r.status === 'completed' && (
                  <button
                    onClick={() => handleDownloadExport(r.id)}
                    disabled={loading}
                    className="text-[12px] text-claude-accent hover:underline font-sans"
                  >
                    {t('download')}
                  </button>
                )}
              </div>
            ))}
        </div>
      )}

      {/* Cookie Preferences */}
      <div className="p-4 bg-white rounded-xl border border-claude-border">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-[14px] font-medium text-claude-text font-sans">
              {t('cookiePreferences')}
            </h4>
            <p className="text-[12px] text-claude-subtext mt-1 font-sans">
              {t('cookiePreferencesDesc')}
            </p>
          </div>
          <button
            onClick={() => useConsentStore.getState().openSettings()}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium bg-claude-bg hover:bg-claude-border/50 border border-claude-border rounded-lg transition-colors"
          >
            <Cookie size={14} />
            {t('customize')}
          </button>
        </div>
      </div>

      {/* Delete Account */}
      <div className="p-4 bg-red-50/50 rounded-xl border border-red-200/50">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="text-[14px] font-medium text-red-700 font-sans">
              {t('deleteMyAccount')}
            </h4>
            <p className="text-[12px] text-red-600/70 mt-1 font-sans">
              {t('deleteMyAccountDesc')}
            </p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-2 px-4 py-2 text-[13px] font-medium text-red-600 bg-red-100 hover:bg-red-200 border border-red-200 rounded-lg transition-colors"
          >
            <Trash2 size={14} />
            {t('deleteBtn')}
          </button>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-red-100 rounded-full">
                <AlertTriangle size={20} className="text-red-600" />
              </div>
              <h3 className="text-lg font-semibold text-claude-text font-sans">
                {t('deleteAccountTitle')}
              </h3>
            </div>
            <p className="text-[13px] text-claude-subtext mb-6 font-sans leading-relaxed">
              {t('deleteAccountWarning')}
            </p>
            <ul className="text-[13px] text-claude-subtext mb-6 font-sans space-y-1 pl-4">
              <li>{t('deleteItem1')}</li>
              <li>{t('deleteItem2')}</li>
              <li>{t('deleteItem3')}</li>
              <li>{t('deleteItem4')}</li>
            </ul>
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-2.5 text-[13px] font-medium border border-claude-border rounded-xl hover:bg-claude-bg transition-colors font-sans"
              >
                {t('cancel')}
              </button>
              <button
                onClick={handleDeleteAccount}
                disabled={deleting}
                className="flex-1 py-2.5 text-[13px] font-medium text-white bg-red-600 hover:bg-red-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 font-sans"
              >
                {deleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                {t('deleteForever')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
