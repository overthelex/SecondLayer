import { useEffect, useState, useRef, useCallback } from 'react';
import { DollarSign, Activity, Zap, Mail, Shield, User, Settings, CreditCard } from 'lucide-react';
import { startRegistration } from '@simplewebauthn/browser';
import { useAuth } from '../../contexts/AuthContext';
import { authService, billingService } from '../../services';
import { api } from '../../utils/api-client';
import { BillingBalance } from '../../types/models';
import showToast from '../../utils/toast';
import type { EditFormState, UseProfileReturn } from './types';

export function useProfile(): UseProfileReturn {
  const { user, isLoading, updateUser } = useAuth();
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [billing, setBilling] = useState<BillingBalance | null>(null);
  const [webauthnCredentials, setWebauthnCredentials] = useState<any[]>([]);
  const [isRegisteringKey, setIsRegisteringKey] = useState(false);
  const [isDeletingKey, setIsDeletingKey] = useState<string | null>(null);
  const [mcpTokens, setMcpTokens] = useState<any[]>([]);
  const [isCreatingToken, setIsCreatingToken] = useState(false);
  const [isTokenModalOpen, setIsTokenModalOpen] = useState(false);
  const [newTokenName, setNewTokenName] = useState('');
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState(false);
  const [isDeletingToken, setIsDeletingToken] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [editForm, setEditForm] = useState<EditFormState>({
    name: '',
    phone: '',
    picture: ''
  });

  const loadCredentials = useCallback(async () => {
    try {
      const data = await authService.webauthnListCredentials();
      setWebauthnCredentials(data.credentials || []);
    } catch (err) {
      console.error('Failed to load WebAuthn credentials:', err);
    }
  }, []);

  const loadMcpTokens = useCallback(async () => {
    try {
      const { data } = await api.keys.list();
      setMcpTokens(data.keys || []);
    } catch (err) {
      console.error('Failed to load MCP tokens:', err);
    }
  }, []);

  // Fetch billing data, WebAuthn credentials, and MCP tokens
  useEffect(() => {
    if (user) {
      billingService.getBillingSummary()
        .then(data => setBilling(data))
        .catch(err => console.error('Failed to load billing:', err));
      loadCredentials();
      loadMcpTokens();
    }
  }, [user, loadCredentials, loadMcpTokens]);

  // Initialize form when user data loads
  useEffect(() => {
    if (user) {
      setEditForm({
        name: user.name || '',
        phone: (user as any).phone || '',
        picture: user.picture || ''
      });
    }
  }, [user]);

  const handleEditProfile = () => {
    setIsEditModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsEditModalOpen(false);
    if (user) {
      setEditForm({
        name: user.name || '',
        phone: (user as any).phone || '',
        picture: user.picture || ''
      });
    }
  };

  const handleSaveProfile = async () => {
    try {
      setIsSaving(true);
      const updatedUser = await authService.updateProfile({
        name: editForm.name || undefined,
        phone: editForm.phone || undefined,
        picture: editForm.picture || undefined
      });
      updateUser(updatedUser);
      showToast.success('Профіль успішно оновлено');
      setIsEditModalOpen(false);
    } catch (error) {
      console.error('Failed to update profile:', error);
      showToast.error('Не вдалося оновити профіль');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showToast.error('Будь ласка, виберіть файл зображення');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showToast.error('Розмір файлу не повинен перевищувати 5MB');
      return;
    }

    try {
      setIsUploadingPhoto(true);
      const reader = new FileReader();
      reader.onload = async (e) => {
        const base64 = e.target?.result as string;
        try {
          const updatedUser = await authService.updateProfile({
            picture: base64
          });
          updateUser(updatedUser);
          setEditForm(prev => ({ ...prev, picture: base64 }));
          showToast.success('Фото профілю оновлено');
        } catch (error) {
          console.error('Failed to upload photo:', error);
          showToast.error('Не вдалося завантажити фото');
        } finally {
          setIsUploadingPhoto(false);
        }
      };
      reader.onerror = () => {
        showToast.error('Помилка читання файлу');
        setIsUploadingPhoto(false);
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error handling file:', error);
      showToast.error('Помилка обробки файлу');
      setIsUploadingPhoto(false);
    }
  };

  const handleShare = () => {
    const profileUrl = window.location.href;
    if (navigator.share) {
      navigator.share({
        title: `${user!.name} - SecondLayer Profile`,
        url: profileUrl
      }).catch(() => {
        copyToClipboard(profileUrl);
      });
    } else {
      copyToClipboard(profileUrl);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      showToast.success('Посилання скопійовано');
    }).catch(() => {
      showToast.error('Не вдалося скопіювати посилання');
    });
  };

  const handleRegisterPasskey = async (attachment?: 'cross-platform') => {
    setIsRegisteringKey(true);
    try {
      const options = await authService.webauthnRegisterOptions(attachment);
      const regResponse = await startRegistration({ optionsJSON: options });
      const friendlyName = attachment === 'cross-platform' ? 'Hardware Key' : 'Phone Passkey';
      await authService.webauthnRegisterVerify(regResponse, friendlyName, attachment);
      showToast.success('Ключ безпеки зареєстровано!');
      await loadCredentials();
    } catch (err: any) {
      if (err.name === 'NotAllowedError') {
        showToast.error('Реєстрацію скасовано');
      } else {
        console.error('Passkey registration failed:', err);
        showToast.error(err.message || 'Не вдалося зареєструвати ключ');
      }
    } finally {
      setIsRegisteringKey(false);
    }
  };

  const handleDeleteCredential = async (credentialId: string) => {
    setIsDeletingKey(credentialId);
    try {
      await authService.webauthnDeleteCredential(credentialId);
      showToast.success('Ключ видалено');
      await loadCredentials();
    } catch (err: any) {
      console.error('Failed to delete credential:', err);
      showToast.error('Не вдалося видалити ключ');
    } finally {
      setIsDeletingKey(null);
    }
  };

  const handleCreateMcpToken = async () => {
    if (!newTokenName.trim()) {
      showToast.error('Введіть назву токена');
      return;
    }
    setIsCreatingToken(true);
    try {
      const { data } = await api.keys.create({ name: newTokenName.trim() });
      setRevealedToken(data.key.key);
      setNewTokenName('');
      await loadMcpTokens();
    } catch (err: any) {
      console.error('Failed to create MCP token:', err);
      showToast.error('Не вдалося створити токен');
    } finally {
      setIsCreatingToken(false);
    }
  };

  const handleRevokeMcpToken = async (keyId: string) => {
    setIsDeletingToken(keyId);
    try {
      await api.keys.revoke(keyId);
      showToast.success('Токен відкликано');
      await loadMcpTokens();
    } catch (err: any) {
      console.error('Failed to revoke MCP token:', err);
      showToast.error('Не вдалося відкликати токен');
    } finally {
      setIsDeletingToken(null);
    }
  };

  const handleCopyToken = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedToken(true);
      showToast.success('Скопійовано');
      setTimeout(() => setCopiedToken(false), 2000);
    });
  };

  const stats = [{
    label: 'Balance',
    value: billing ? `$${Number(billing.balance_usd).toFixed(2)}` : '—',
    icon: DollarSign
  }, {
    label: 'Total Requests',
    value: billing ? String(billing.total_requests) : '—',
    icon: Activity
  }, {
    label: 'Total Spent',
    value: billing ? `$${Number(billing.total_spent_usd).toFixed(2)}` : '—',
    icon: Zap
  }];

  const settingsGroups = [{
    title: 'Account',
    items: [{
      icon: Mail,
      label: 'Email',
      value: user?.email || 'Not set'
    }, {
      icon: Shield,
      label: 'Authentication',
      value: 'Google OAuth'
    }, {
      icon: User,
      label: 'User ID',
      value: user?.id?.substring(0, 8) + '...' || 'N/A'
    }]
  }, {
    title: 'Application',
    items: [{
      icon: Settings,
      label: 'Language',
      value: 'Українська'
    }, {
      icon: CreditCard,
      label: 'Billing',
      value: billing ? `$${Number(billing.balance_usd).toFixed(2)} • ${billing.pricing_tier}` : 'Loading...',
      onClick: () => window.location.href = '/billing'
    }]
  }];

  return {
    user,
    isLoading,
    billing,
    editForm,
    setEditForm,
    isEditModalOpen,
    isSaving,
    isUploadingPhoto,
    fileInputRef,
    webauthnCredentials,
    isRegisteringKey,
    isDeletingKey,
    mcpTokens,
    isCreatingToken,
    isTokenModalOpen,
    setIsTokenModalOpen,
    newTokenName,
    setNewTokenName,
    revealedToken,
    setRevealedToken,
    copiedToken,
    isDeletingToken,
    handleEditProfile,
    handleCloseModal,
    handleSaveProfile,
    handlePhotoClick,
    handleFileChange,
    handleShare,
    handleRegisterPasskey,
    handleDeleteCredential,
    handleCreateMcpToken,
    handleRevokeMcpToken,
    handleCopyToken,
    stats,
    settingsGroups,
  };
}
