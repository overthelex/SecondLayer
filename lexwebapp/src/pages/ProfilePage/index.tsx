import { motion } from 'framer-motion';
import { Loader2, Mail, Phone, ChevronRight } from 'lucide-react';
import { GdprPrivacySection } from '../../components/GdprPrivacySection';
import { useProfile } from './useProfile';
import { ProfileHeader } from './ProfileHeader';
import { SecuritySection } from './SecuritySection';
import { ApiTokensSection } from './ApiTokensSection';
import { BillingSection } from './BillingSection';
import { EditProfileModal } from './EditProfileModal';
import { TokenModal } from './TokenModal';

export function ProfilePage() {
  const profile = useProfile();
  const { user, isLoading, billing, settingsGroups, stats } = profile;

  // Show loading state
  if (isLoading) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-claude-bg">
        <div className="text-center">
          <Loader2 size={48} className="text-claude-accent animate-spin mx-auto mb-4" />
          <p className="text-claude-text font-sans">Loading profile...</p>
        </div>
      </div>
    );
  }

  // Show error if no user data
  if (!user) {
    return (
      <div className="flex-1 h-full flex items-center justify-center bg-claude-bg">
        <div className="text-center">
          <p className="text-claude-text font-sans mb-4">No user data available</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-claude-accent text-white rounded-xl font-medium hover:bg-[#C66345] transition-colors"
          >
            Reload Page
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 h-full overflow-y-auto bg-claude-bg p-4 md:p-8 lg:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        {/* Header Section */}
        <ProfileHeader
          user={user}
          isUploadingPhoto={profile.isUploadingPhoto}
          fileInputRef={profile.fileInputRef}
          handlePhotoClick={profile.handlePhotoClick}
          handleFileChange={profile.handleFileChange}
          handleEditProfile={profile.handleEditProfile}
          handleShare={profile.handleShare}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Left Column - Bio & Personal */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            className="md:col-span-2 space-y-8"
          >
            {/* Bio Section */}
            <section className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-serif text-claude-text">Profile Information</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium text-claude-subtext">Email</label>
                  <p className="text-claude-text mt-1 flex items-center gap-2">
                    <Mail size={16} className="text-claude-subtext" />
                    {user?.email || 'Not available'}
                    {user?.emailVerified && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 border border-green-200 rounded-full text-xs text-green-700">
                        ✓ Verified
                      </span>
                    )}
                  </p>
                </div>

                {(user as any).phone && (
                  <div>
                    <label className="text-sm font-medium text-claude-subtext">Phone</label>
                    <p className="text-claude-text mt-1 flex items-center gap-2">
                      <Phone size={16} className="text-claude-subtext" />
                      {(user as any).phone}
                    </p>
                  </div>
                )}

                <div>
                  <label className="text-sm font-medium text-claude-subtext">Last Login</label>
                  <p className="text-claude-text mt-1">
                    {user?.lastLogin ? new Date(user.lastLogin).toLocaleString('uk-UA', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    }) : 'Not available'}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-medium text-claude-subtext">Account Created</label>
                  <p className="text-claude-text mt-1">
                    {user?.createdAt ? new Date(user.createdAt).toLocaleString('uk-UA', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric'
                    }) : 'Not available'}
                  </p>
                </div>
              </div>
            </section>

            {/* Settings Groups */}
            <div className="space-y-6">
              {settingsGroups.map((group) => (
                <section key={group.title} className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
                  <div className="px-6 py-4 border-b border-claude-border/50 bg-claude-bg/30">
                    <h3 className="text-sm font-semibold text-claude-subtext uppercase tracking-wider">
                      {group.title}
                    </h3>
                  </div>
                  <div className="divide-y divide-claude-border/50">
                    {group.items.map((item) => (
                      <button
                        key={item.label}
                        onClick={item.onClick}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-claude-bg/50 transition-colors group"
                      >
                        <div className="flex items-center gap-4">
                          <div className="p-2 bg-claude-bg rounded-lg text-claude-subtext group-hover:text-claude-accent transition-colors">
                            <item.icon size={18} />
                          </div>
                          <div className="text-left">
                            <div className="text-sm font-medium text-claude-text">
                              {item.label}
                            </div>
                            <div className="text-xs text-claude-subtext">
                              {item.value}
                            </div>
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-claude-border group-hover:text-claude-subtext transition-colors" />
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            {/* Security Keys Section */}
            <SecuritySection
              webauthnCredentials={profile.webauthnCredentials}
              isRegisteringKey={profile.isRegisteringKey}
              isDeletingKey={profile.isDeletingKey}
              handleRegisterPasskey={profile.handleRegisterPasskey}
              handleDeleteCredential={profile.handleDeleteCredential}
            />

            {/* MCP Access Tokens Section */}
            <ApiTokensSection
              mcpTokens={profile.mcpTokens}
              isDeletingToken={profile.isDeletingToken}
              handleRevokeMcpToken={profile.handleRevokeMcpToken}
              setIsTokenModalOpen={profile.setIsTokenModalOpen}
              setRevealedToken={profile.setRevealedToken}
              setNewTokenName={profile.setNewTokenName}
            />

            {/* GDPR Privacy Section */}
            <section className="bg-white rounded-2xl p-6 border border-claude-border shadow-sm">
              <GdprPrivacySection />
            </section>
          </motion.div>

          {/* Right Column - Stats & Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="space-y-6"
          >
            {/* Usage Stats */}
            <BillingSection billing={billing} stats={stats} />

            {/* Pro Card */}
            <div className="bg-gradient-to-br from-claude-text to-gray-800 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -mr-16 -mt-16 blur-2xl group-hover:bg-white/10 transition-colors duration-500" />

              <div className="relative z-10">
                <div className="inline-flex items-center gap-2 px-2.5 py-1 bg-white/10 rounded-full text-xs font-medium mb-4 border border-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-claude-accent" />
                  Pro Plan
                </div>
                <h3 className="text-xl font-serif mb-2">
                  Upgrade your workflow
                </h3>
                <p className="text-white/70 text-sm mb-6 leading-relaxed">
                  Get access to advanced models, longer context window, and
                  priority support.
                </p>
                <button
                  onClick={() => window.location.href = '/billing'}
                  className="w-full py-2.5 bg-white text-claude-text rounded-xl font-medium text-sm hover:bg-gray-50 transition-colors active:scale-[0.98]"
                >
                  Manage Subscription
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* MCP Token Modal */}
      <TokenModal
        isTokenModalOpen={profile.isTokenModalOpen}
        setIsTokenModalOpen={profile.setIsTokenModalOpen}
        revealedToken={profile.revealedToken}
        copiedToken={profile.copiedToken}
        newTokenName={profile.newTokenName}
        setNewTokenName={profile.setNewTokenName}
        isCreatingToken={profile.isCreatingToken}
        handleCreateMcpToken={profile.handleCreateMcpToken}
        handleCopyToken={profile.handleCopyToken}
      />

      {/* Edit Profile Modal */}
      <EditProfileModal
        user={user}
        isEditModalOpen={profile.isEditModalOpen}
        isSaving={profile.isSaving}
        isUploadingPhoto={profile.isUploadingPhoto}
        editForm={profile.editForm}
        setEditForm={profile.setEditForm}
        handleCloseModal={profile.handleCloseModal}
        handleSaveProfile={profile.handleSaveProfile}
        handlePhotoClick={profile.handlePhotoClick}
      />
    </div>
  );
}
