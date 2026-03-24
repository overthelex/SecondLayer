import { motion } from 'framer-motion';
import { Camera, Edit2, Loader2 } from 'lucide-react';
import type { UseProfileReturn } from './types';
import { useProfileT } from '../../i18n/profile-i18n';

type ProfileHeaderProps = Pick<
  UseProfileReturn,
  'user' | 'isUploadingPhoto' | 'fileInputRef' | 'handlePhotoClick' | 'handleFileChange' | 'handleEditProfile'
>;

export function ProfileHeader({
  user,
  isUploadingPhoto,
  fileInputRef,
  handlePhotoClick,
  handleFileChange,
  handleEditProfile,
}: ProfileHeaderProps) {
  const t = useProfileT();
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative bg-white rounded-2xl p-6 md:p-8 border border-claude-border shadow-sm overflow-hidden"
    >
      {user?.banner ? (
        <img src={user.banner} alt="" className="absolute top-0 left-0 w-full h-32 object-cover" />
      ) : (
        <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-r from-claude-accent/10 to-claude-bg" />
      )}

      <div className="relative flex flex-col md:flex-row items-start md:items-end gap-6 pt-12">
        <div className="relative group">
          <input
            id="profile-photo-upload"
            name="profile-photo"
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/bmp,image/tiff,image/avif,image/heif,image/heic,image/svg+xml,image/x-icon,.jpg,.jpeg,.png,.webp,.gif,.bmp,.tiff,.tif,.avif,.heif,.heic,.svg,.ico,.enc"
            onChange={handleFileChange}
            className="hidden"
          />
          <div className="w-24 h-24 md:w-32 md:h-32 rounded-full bg-claude-sidebar border-4 border-white shadow-md flex items-center justify-center text-3xl font-serif text-claude-subtext overflow-hidden">
            {user?.picture ? (
              <img
                src={user.picture.startsWith('/auth/avatar/') ? `${user.picture}?v=${Date.now()}` : user.picture}
                alt={user.name || 'User avatar'}
                className="w-full h-full object-cover group-hover:opacity-50 transition-opacity duration-200"
              />
            ) : (
              <span className="group-hover:opacity-50 transition-opacity duration-200">
                {user?.name?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
              </span>
            )}
            {isUploadingPhoto && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                <Loader2 size={24} className="text-white animate-spin" />
              </div>
            )}
            <div
              onClick={handlePhotoClick}
              className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-black/10 cursor-pointer"
            >
              <Camera size={24} className="text-white" />
            </div>
          </div>
          <button
            onClick={handlePhotoClick}
            disabled={isUploadingPhoto}
            className="absolute bottom-0 right-0 p-2 bg-white rounded-full border border-claude-border shadow-sm text-claude-subtext hover:text-claude-accent transition-colors disabled:opacity-50"
          >
            <Edit2 size={14} />
          </button>
        </div>

        <div className="flex-1 mb-2">
          <h1 className="text-3xl md:text-4xl font-serif text-claude-text font-medium tracking-tight">
            {user?.name || 'User'}
          </h1>
          <p className="text-claude-subtext mt-1 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            {user?.emailVerified && '✓ '}{t.verifiedMember} {user?.createdAt ? new Date(user.createdAt).getFullYear() : new Date().getFullYear()} {t.yearSuffix}
          </p>
        </div>

        <div className="flex gap-3 w-full md:w-auto">
          <button
            onClick={handleEditProfile}
            className="flex-1 md:flex-none px-4 py-2.5 bg-claude-accent text-white rounded-xl font-medium text-sm hover:bg-[#C66345] transition-colors shadow-sm active:scale-[0.98]"
          >
            {t.editButton}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
