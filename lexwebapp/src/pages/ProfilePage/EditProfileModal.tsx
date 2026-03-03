import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Loader2, X, Save, Upload } from 'lucide-react';
import type { UseProfileReturn } from './types';

type EditProfileModalProps = Pick<
  UseProfileReturn,
  'user' | 'isEditModalOpen' | 'isSaving' | 'isUploadingPhoto' | 'editForm' | 'setEditForm' | 'handleCloseModal' | 'handleSaveProfile' | 'handlePhotoClick'
>;

export function EditProfileModal({
  user,
  isEditModalOpen,
  isSaving,
  isUploadingPhoto,
  editForm,
  setEditForm,
  handleCloseModal,
  handleSaveProfile,
  handlePhotoClick,
}: EditProfileModalProps) {
  return (
    <AnimatePresence>
      {isEditModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleCloseModal}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 bg-white border-b border-claude-border px-6 py-4 flex items-center justify-between z-10">
              <h2 className="text-xl font-serif text-claude-text">Редагування профілю</h2>
              <button
                onClick={handleCloseModal}
                className="p-2 hover:bg-claude-bg rounded-lg transition-colors"
              >
                <X size={20} className="text-claude-subtext" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Avatar Preview */}
              <div className="flex flex-col items-center gap-4">
                <div className="w-24 h-24 rounded-full bg-claude-sidebar border-4 border-claude-bg flex items-center justify-center text-2xl font-serif text-claude-subtext overflow-hidden">
                  {editForm.picture ? (
                    <img
                      src={editForm.picture}
                      alt="Avatar preview"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>
                      {editForm.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                    </span>
                  )}
                </div>
                <button
                  onClick={handlePhotoClick}
                  disabled={isUploadingPhoto}
                  className="px-4 py-2 bg-claude-bg border border-claude-border rounded-lg text-sm font-medium text-claude-text hover:bg-claude-sidebar transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  {isUploadingPhoto ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Upload size={16} />
                  )}
                  {isUploadingPhoto ? 'Завантаження...' : 'Змінити фото'}
                </button>
              </div>

              {/* Name Field */}
              <div>
                <label htmlFor="profile-name" className="block text-sm font-medium text-claude-text mb-2">
                  Повне ім'я
                </label>
                <input
                  id="profile-name"
                  name="name"
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-claude-border rounded-lg focus:outline-none focus:ring-2 focus:ring-claude-accent focus:border-transparent transition-all"
                  placeholder="Введіть ваше ім'я"
                />
              </div>

              {/* Phone Field */}
              <div>
                <label htmlFor="profile-phone" className="block text-sm font-medium text-claude-text mb-2">
                  Номер телефону (необов'язково)
                </label>
                <input
                  id="profile-phone"
                  name="phone"
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-claude-border rounded-lg focus:outline-none focus:ring-2 focus:ring-claude-accent focus:border-transparent transition-all"
                  placeholder="+380 XX XXX XX XX"
                />
              </div>

              {/* Email Field (Read-only) */}
              <div>
                <label className="block text-sm font-medium text-claude-text mb-2">
                  Електронна пошта
                </label>
                <div className="w-full px-4 py-2.5 border border-claude-border rounded-lg bg-claude-bg text-claude-subtext flex items-center gap-2">
                  <Mail size={16} />
                  {user?.email}
                </div>
                <p className="text-xs text-claude-subtext mt-1">
                  Email не можна змінити з міркувань безпеки
                </p>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white border-t border-claude-border px-6 py-4 flex gap-3">
              <button
                onClick={handleCloseModal}
                className="flex-1 px-4 py-2.5 bg-white border border-claude-border text-claude-text rounded-xl font-medium text-sm hover:bg-claude-bg transition-colors"
              >
                Скасувати
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSaving}
                className="flex-1 px-4 py-2.5 bg-claude-accent text-white rounded-xl font-medium text-sm hover:bg-[#C66345] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Збереження...
                  </>
                ) : (
                  <>
                    <Save size={16} />
                    Зберегти
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
