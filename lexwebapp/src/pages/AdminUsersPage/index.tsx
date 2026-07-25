import { RefreshCw, Users, XCircle } from 'lucide-react';
import { useAdminUsers } from './useAdminUsers';
import { UserFilters } from './UserFilters';
import { UsersTable } from './UsersTable';
import {
  TierModal, BalanceModal, LimitsModal,
  ResetPasswordConfirmModal, ResetPasswordResultModal,
  CreateTestUserModal, AttorneyModal,
} from './UserModals';

export function AdminUsersPage() {
  const state = useAdminUsers();

  if (state.error && state.users.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center">
          <XCircle size={32} className="text-red-500" />
          <p className="text-red-600">{state.error}</p>
          <button onClick={() => state.fetchUsers(0)} className="px-4 py-2 bg-claude-text text-white rounded-lg text-sm">
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-claude-text font-sans">User Management</h1>
          <p className="text-sm text-claude-subtext mt-1">{state.pagination.total} total users</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => state.setCreateTestUser({ email: '', name: '', password: '', credits: '100' })}
            className="flex items-center gap-2 px-4 py-2 bg-amber-500 text-white rounded-lg text-sm hover:bg-amber-600 transition-colors"
          >
            <Users size={14} />
            Create Test User
          </button>
          <button
            onClick={() => state.fetchUsers(state.pagination.offset)}
            disabled={state.loading}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-claude-border rounded-lg text-sm text-claude-text hover:bg-claude-bg transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={state.loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      <UserFilters
        searchInput={state.searchInput}
        setSearchInput={state.setSearchInput}
        handleSearch={state.handleSearch}
        tierFilter={state.tierFilter}
        setTierFilter={state.setTierFilter}
        tagFilter={state.tagFilter}
        setTagFilter={state.setTagFilter}
      />

      <UsersTable
        users={state.users}
        loading={state.loading}
        pagination={state.pagination}
        totalPages={state.totalPages}
        currentPage={state.currentPage}
        selectedUserId={state.selectedUserId}
        detail={state.detail}
        detailLoading={state.detailLoading}
        loadDetail={state.loadDetail}
        fetchUsers={state.fetchUsers}
        setTierAction={state.setTierAction}
        setBalanceAction={state.setBalanceAction}
        setLimitsAction={state.setLimitsAction}
        handleToggleCrypto={state.handleToggleCrypto}
        handleToggleTest={state.handleToggleTest}
        setResetPasswordConfirm={state.setResetPasswordConfirm}
        openAttorneyModal={state.openAttorneyModal}
      />

      {/* Modals */}
      {state.tierAction && (
        <TierModal
          tierAction={state.tierAction}
          setTierAction={() => state.setTierAction(null)}
          handleTierChange={state.handleTierChange}
          onChange={state.setTierAction}
        />
      )}

      {state.balanceAction && (
        <BalanceModal
          balanceAction={state.balanceAction}
          setBalanceAction={() => state.setBalanceAction(null)}
          handleAdjustBalance={state.handleAdjustBalance}
          onChange={state.setBalanceAction}
        />
      )}

      {state.limitsAction && (
        <LimitsModal
          limitsAction={state.limitsAction}
          setLimitsAction={() => state.setLimitsAction(null)}
          handleUpdateLimits={state.handleUpdateLimits}
          onChange={state.setLimitsAction}
        />
      )}

      {state.resetPasswordConfirm && (
        <ResetPasswordConfirmModal
          data={state.resetPasswordConfirm}
          onClose={() => state.setResetPasswordConfirm(null)}
          onConfirm={state.handleResetPassword}
          loading={state.resetPasswordLoading}
        />
      )}

      {state.resetPasswordResult && (
        <ResetPasswordResultModal
          password={state.resetPasswordResult}
          onClose={() => state.setResetPasswordResult(null)}
        />
      )}

      {state.createTestUser && (
        <CreateTestUserModal
          data={state.createTestUser}
          onChange={state.setCreateTestUser}
          onClose={() => state.setCreateTestUser(null)}
          onSubmit={state.handleCreateTestUser}
          loading={state.createTestUserLoading}
        />
      )}

      {state.attorneyModal && (
        <AttorneyModal
          data={state.attorneyModal}
          form={state.attorneyForm}
          setForm={state.setAttorneyForm}
          isEdit={state.attorneyIsEdit}
          loading={state.attorneyLoading}
          saving={state.attorneySaving}
          onClose={() => state.setAttorneyModal(null)}
          onSave={state.handleSaveAttorneyProfile}
          onDelete={state.handleDeleteAttorneyProfile}
          toggleArray={state.toggleAttorneyArray}
        />
      )}
    </div>
  );
}
