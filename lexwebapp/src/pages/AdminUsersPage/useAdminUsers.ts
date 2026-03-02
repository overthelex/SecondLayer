import { useEffect, useState, useCallback } from 'react';
import { api } from '../../utils/api-client';
import toast from 'react-hot-toast';
import {
  UserRow, UserDetail, Pagination, AttorneyFormData,
  PAGE_SIZE, DEFAULT_ATTORNEY_FORM,
} from './types';

export function useAdminUsers() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ limit: PAGE_SIZE, offset: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Detail panel
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Action states
  const [tierAction, setTierAction] = useState<{ userId: string; tier: string } | null>(null);
  const [balanceAction, setBalanceAction] = useState<{ userId: string; amount: string; reason: string } | null>(null);
  const [limitsAction, setLimitsAction] = useState<{ userId: string; daily: string; monthly: string } | null>(null);
  const [createTestUser, setCreateTestUser] = useState<{ email: string; name: string; password: string; credits: string } | null>(null);
  const [createTestUserLoading, setCreateTestUserLoading] = useState(false);

  // Password reset state
  const [resetPasswordConfirm, setResetPasswordConfirm] = useState<{ userId: string; email: string } | null>(null);
  const [resetPasswordResult, setResetPasswordResult] = useState<string | null>(null);
  const [resetPasswordLoading, setResetPasswordLoading] = useState(false);

  // Attorney profile state
  const [attorneyModal, setAttorneyModal] = useState<{ userId: string; email: string } | null>(null);
  const [attorneyForm, setAttorneyForm] = useState<AttorneyFormData>(DEFAULT_ATTORNEY_FORM);
  const [attorneyIsEdit, setAttorneyIsEdit] = useState(false);
  const [attorneyLoading, setAttorneyLoading] = useState(false);
  const [attorneySaving, setAttorneySaving] = useState(false);

  const fetchUsers = useCallback(async (offset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params: any = { limit: PAGE_SIZE, offset };
      if (search) params.search = search;
      if (tierFilter) params.tier = tierFilter;
      if (tagFilter) params.tag = tagFilter;
      const res = await api.admin.getUsers(params);
      setUsers(res.data.users || []);
      setPagination(res.data.pagination || { limit: PAGE_SIZE, offset, total: 0 });
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, tierFilter, tagFilter]);

  useEffect(() => {
    fetchUsers(0);
  }, [fetchUsers]);

  const handleSearch = () => setSearch(searchInput);

  const loadDetail = async (userId: string, forceReload = false) => {
    if (selectedUserId === userId && !forceReload) {
      setSelectedUserId(null);
      setDetail(null);
      return;
    }
    setSelectedUserId(userId);
    setDetailLoading(true);
    try {
      const res = await api.admin.getUser(userId);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleTierChange = async () => {
    if (!tierAction) return;
    try {
      await api.admin.updateUserTier(tierAction.userId, tierAction.tier);
      toast.success('Tier updated');
      setTierAction(null);
      fetchUsers(pagination.offset);
      if (selectedUserId === tierAction.userId) loadDetail(tierAction.userId, true);
    } catch {
      toast.error('Failed to update tier');
    }
  };

  const handleAdjustBalance = async () => {
    if (!balanceAction) return;
    const amount = parseFloat(balanceAction.amount);
    if (isNaN(amount) || !balanceAction.reason.trim()) {
      toast.error('Enter valid amount and reason');
      return;
    }
    try {
      await api.admin.adjustBalance(balanceAction.userId, amount, balanceAction.reason);
      toast.success('Balance adjusted');
      setBalanceAction(null);
      fetchUsers(pagination.offset);
      if (selectedUserId === balanceAction.userId) loadDetail(balanceAction.userId, true);
    } catch {
      toast.error('Failed to adjust balance');
    }
  };

  const handleUpdateLimits = async () => {
    if (!limitsAction) return;
    const limits: any = {};
    if (limitsAction.daily) limits.dailyLimitUsd = parseFloat(limitsAction.daily);
    if (limitsAction.monthly) limits.monthlyLimitUsd = parseFloat(limitsAction.monthly);
    try {
      await api.admin.updateLimits(limitsAction.userId, limits);
      toast.success('Limits updated');
      const userId = limitsAction.userId;
      setLimitsAction(null);
      fetchUsers(pagination.offset);
      if (selectedUserId === userId) loadDetail(userId, true);
    } catch {
      toast.error('Failed to update limits');
    }
  };

  const handleToggleCrypto = async (userId: string, currentlyEnabled: boolean) => {
    try {
      await api.admin.toggleCryptoTag(userId, !currentlyEnabled);
      toast.success(currentlyEnabled ? 'Crypto tag removed' : 'Crypto tag assigned');
      fetchUsers(pagination.offset);
      if (selectedUserId === userId) loadDetail(userId, true);
    } catch {
      toast.error('Failed to toggle crypto tag');
    }
  };

  const handleToggleTest = async (userId: string, currentlyEnabled: boolean) => {
    try {
      await api.admin.toggleTestTag(userId, !currentlyEnabled);
      toast.success(currentlyEnabled ? 'Test tag removed' : 'Test tag assigned');
      fetchUsers(pagination.offset);
      if (selectedUserId === userId) loadDetail(userId, true);
    } catch {
      toast.error('Failed to toggle test tag');
    }
  };

  const handleCreateTestUser = async () => {
    if (!createTestUser) return;
    const { email, name, password, credits } = createTestUser;
    if (!email.trim() || !password.trim()) {
      toast.error('Email and password are required');
      return;
    }
    if (password.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }
    setCreateTestUserLoading(true);
    try {
      await api.admin.createTestUser({
        email: email.trim(),
        name: name.trim() || undefined,
        password,
        credits: Number(credits) || 0,
      });
      toast.success(`Test user ${email} created`);
      setCreateTestUser(null);
      fetchUsers(0);
    } catch {
      // Error toast handled by interceptor
    } finally {
      setCreateTestUserLoading(false);
    }
  };

  const handleResetPassword = async () => {
    if (!resetPasswordConfirm) return;
    setResetPasswordLoading(true);
    try {
      const res = await api.admin.resetUserPassword(resetPasswordConfirm.userId);
      setResetPasswordConfirm(null);
      setResetPasswordResult(res.data.password);
    } catch {
      toast.error('Failed to reset password');
    } finally {
      setResetPasswordLoading(false);
    }
  };

  const openAttorneyModal = async (userId: string, email: string) => {
    setAttorneyModal({ userId, email });
    setAttorneyLoading(true);
    setAttorneyIsEdit(false);
    setAttorneyForm({ ...DEFAULT_ATTORNEY_FORM });
    try {
      const res = await api.admin.getAttorneyProfile(userId);
      const p = res.data;
      setAttorneyForm({
        bar_license_number: p.bar_license_number || '',
        bar_admission_date: p.bar_admission_date ? p.bar_admission_date.split('T')[0] : '',
        years_experience: p.years_experience?.toString() || '',
        education: p.education || '',
        specializations: p.specializations || [],
        court_types: p.court_types || [],
        region: p.region || '',
        city: p.city || '',
        serves_remotely: p.serves_remotely ?? true,
        consultation_fee_uah: p.consultation_fee_uah?.toString() || '',
        hourly_rate_uah: p.hourly_rate_uah?.toString() || '',
        representation_fee_uah: p.representation_fee_uah?.toString() || '',
        free_initial_consultation: p.free_initial_consultation ?? false,
        bio: p.bio || '',
        is_available: p.is_available ?? true,
        is_public: p.is_public ?? true,
      });
      setAttorneyIsEdit(true);
    } catch {
      // No profile yet — create mode
    } finally {
      setAttorneyLoading(false);
    }
  };

  const handleSaveAttorneyProfile = async () => {
    if (!attorneyModal) return;
    setAttorneySaving(true);
    try {
      const payload: any = {
        bar_license_number: attorneyForm.bar_license_number || null,
        bar_admission_date: attorneyForm.bar_admission_date || null,
        years_experience: attorneyForm.years_experience ? parseInt(attorneyForm.years_experience) : null,
        education: attorneyForm.education || null,
        specializations: attorneyForm.specializations,
        court_types: attorneyForm.court_types,
        region: attorneyForm.region || null,
        city: attorneyForm.city || null,
        serves_remotely: attorneyForm.serves_remotely,
        consultation_fee_uah: attorneyForm.consultation_fee_uah ? parseFloat(attorneyForm.consultation_fee_uah) : null,
        hourly_rate_uah: attorneyForm.hourly_rate_uah ? parseFloat(attorneyForm.hourly_rate_uah) : null,
        representation_fee_uah: attorneyForm.representation_fee_uah ? parseFloat(attorneyForm.representation_fee_uah) : null,
        free_initial_consultation: attorneyForm.free_initial_consultation,
        bio: attorneyForm.bio || null,
        is_available: attorneyForm.is_available,
        is_public: attorneyForm.is_public,
      };
      if (attorneyIsEdit) {
        await api.admin.updateAttorneyProfile(attorneyModal.userId, payload);
        toast.success('Профіль адвоката оновлено');
      } else {
        await api.admin.createAttorneyProfile(attorneyModal.userId, payload);
        toast.success('Профіль адвоката створено');
        setAttorneyIsEdit(true);
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Помилка збереження профілю');
    } finally {
      setAttorneySaving(false);
    }
  };

  const handleDeleteAttorneyProfile = async () => {
    if (!attorneyModal) return;
    if (!confirm('Видалити профіль адвоката для цього користувача?')) return;
    try {
      await api.admin.deleteAttorneyProfile(attorneyModal.userId);
      toast.success('Профіль адвоката видалено');
      setAttorneyModal(null);
    } catch {
      toast.error('Помилка видалення профілю');
    }
  };

  const toggleAttorneyArray = (field: 'specializations' | 'court_types', value: string) => {
    setAttorneyForm(prev => {
      const arr = prev[field];
      return { ...prev, [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };

  const totalPages = Math.ceil(pagination.total / PAGE_SIZE);
  const currentPage = Math.floor(pagination.offset / PAGE_SIZE) + 1;

  return {
    // Data
    users, pagination, loading, error, totalPages, currentPage,
    // Filters
    searchInput, setSearchInput, handleSearch, tierFilter, setTierFilter, tagFilter, setTagFilter,
    // Detail
    selectedUserId, detail, detailLoading, loadDetail,
    // Fetch
    fetchUsers,
    // Actions
    tierAction, setTierAction, handleTierChange,
    balanceAction, setBalanceAction, handleAdjustBalance,
    limitsAction, setLimitsAction, handleUpdateLimits,
    handleToggleCrypto, handleToggleTest,
    // Test user
    createTestUser, setCreateTestUser, createTestUserLoading, handleCreateTestUser,
    // Reset password
    resetPasswordConfirm, setResetPasswordConfirm, resetPasswordResult, setResetPasswordResult,
    resetPasswordLoading, handleResetPassword,
    // Attorney
    attorneyModal, setAttorneyModal, attorneyForm, setAttorneyForm,
    attorneyIsEdit, attorneyLoading, attorneySaving,
    openAttorneyModal, handleSaveAttorneyProfile, handleDeleteAttorneyProfile, toggleAttorneyArray,
  };
}
