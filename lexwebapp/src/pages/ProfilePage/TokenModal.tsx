import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, X, Copy, Check } from 'lucide-react';
import type { UseProfileReturn } from './types';

type TokenModalProps = Pick<
  UseProfileReturn,
  'isTokenModalOpen' | 'setIsTokenModalOpen' | 'revealedToken' | 'copiedToken' | 'newTokenName' | 'setNewTokenName' | 'isCreatingToken' | 'handleCreateMcpToken' | 'handleCopyToken'
>;

export function TokenModal({
  isTokenModalOpen,
  setIsTokenModalOpen,
  revealedToken,
  copiedToken,
  newTokenName,
  setNewTokenName,
  isCreatingToken,
  handleCreateMcpToken,
  handleCopyToken,
}: TokenModalProps) {
  return (
    <AnimatePresence>
      {isTokenModalOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setIsTokenModalOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="border-b border-claude-border px-6 py-4 flex items-center justify-between">
              <h2 className="text-xl font-serif text-claude-text">
                {revealedToken ? 'Токен створено' : 'Новий MCP токен'}
              </h2>
              <button
                onClick={() => setIsTokenModalOpen(false)}
                className="p-2 hover:bg-claude-bg rounded-lg transition-colors"
              >
                <X size={20} className="text-claude-subtext" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {revealedToken ? (
                <>
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm text-amber-800 font-medium">
                      Збережіть цей токен — він більше не буде показаний!
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-3 bg-claude-bg rounded-lg text-sm font-mono text-claude-text break-all border border-claude-border/50">
                      {revealedToken}
                    </code>
                    <button
                      onClick={() => handleCopyToken(revealedToken)}
                      className="p-2.5 bg-claude-bg border border-claude-border rounded-lg hover:bg-claude-sidebar transition-colors flex-shrink-0"
                      title="Копіювати"
                    >
                      {copiedToken ? <Check size={18} className="text-green-600" /> : <Copy size={18} className="text-claude-subtext" />}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label htmlFor="token-name" className="block text-sm font-medium text-claude-text mb-2">
                      Назва токена
                    </label>
                    <input
                      id="token-name"
                      name="token-name"
                      type="text"
                      value={newTokenName}
                      onChange={(e) => setNewTokenName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleCreateMcpToken()}
                      className="w-full px-4 py-2.5 border border-claude-border rounded-lg focus:outline-none focus:ring-2 focus:ring-claude-accent focus:border-transparent transition-all"
                      placeholder="напр. Claude Code — MacBook"
                      maxLength={100}
                      autoFocus
                    />
                  </div>
                </>
              )}
            </div>

            <div className="border-t border-claude-border px-6 py-4 flex gap-3">
              {revealedToken ? (
                <button
                  onClick={() => setIsTokenModalOpen(false)}
                  className="flex-1 px-4 py-2.5 bg-claude-accent text-white rounded-xl font-medium text-sm hover:bg-[#C66345] transition-colors"
                >
                  Готово
                </button>
              ) : (
                <>
                  <button
                    onClick={() => setIsTokenModalOpen(false)}
                    className="flex-1 px-4 py-2.5 bg-white border border-claude-border text-claude-text rounded-xl font-medium text-sm hover:bg-claude-bg transition-colors"
                  >
                    Скасувати
                  </button>
                  <button
                    onClick={handleCreateMcpToken}
                    disabled={isCreatingToken || !newTokenName.trim()}
                    className="flex-1 px-4 py-2.5 bg-claude-accent text-white rounded-xl font-medium text-sm hover:bg-[#C66345] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCreatingToken ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        Створення...
                      </>
                    ) : (
                      'Створити'
                    )}
                  </button>
                </>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
