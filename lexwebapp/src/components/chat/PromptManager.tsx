/**
 * PromptManager — load/save prompt buttons + load modal.
 */

import { useState } from 'react';
import { AlignJustify, Save, Loader2, Trash2, Star } from 'lucide-react';
import { promptService, SavedPrompt } from '../../services/api/PromptService';
import showToast from '../../utils/toast';
import { toastT } from '../../i18n/toast-i18n';

interface PromptManagerProps {
  currentInput: string;
  onLoadPrompt: (content: string) => void;
}

export function PromptManager({ currentInput, onLoadPrompt }: PromptManagerProps) {
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [savedPrompts, setSavedPrompts] = useState<SavedPrompt[]>([]);
  const [promptsLoading, setPromptsLoading] = useState(false);
  const [savingPrompt, setSavingPrompt] = useState(false);

  const handleOpenLoad = async () => {
    setPromptsLoading(true);
    setShowLoadModal(true);
    try {
      const prompts = await promptService.list();
      setSavedPrompts(prompts);
    } catch {
      showToast.error(toastT('promptsLoadFailed'));
    } finally {
      setPromptsLoading(false);
    }
  };

  const handleLoadPrompt = (prompt: SavedPrompt) => {
    onLoadPrompt(prompt.content);
    setShowLoadModal(false);
  };

  const handleDeletePrompt = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await promptService.delete(id);
      setSavedPrompts((prev) => prev.filter((p) => p.id !== id));
    } catch {
      showToast.error(toastT('promptDeleteFailed'));
    }
  };

  const handleToggleFavorite = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const { is_favorite } = await promptService.toggleFavorite(id);
      setSavedPrompts((prev) => {
        const updated = prev.map((p) => p.id === id ? { ...p, is_favorite } : p);
        return [...updated].sort((a, b) => Number(b.is_favorite) - Number(a.is_favorite) || new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      });
    } catch {
      showToast.error(toastT('promptFavoriteFailed'));
    }
  };

  const handleSavePrompt = async () => {
    if (!currentInput.trim()) return;
    const autoName = currentInput.trim().split(/\s+/).slice(0, 6).join(' ').slice(0, 60);
    setSavingPrompt(true);
    try {
      await promptService.save(autoName, currentInput.trim());
      showToast.success(toastT('promptSaved'));
    } catch {
      showToast.error(toastT('promptSaveFailed'));
    } finally {
      setSavingPrompt(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 mb-2">
        <button
          type="button"
          onClick={handleOpenLoad}
          className="flex items-center gap-1.5 text-[13px] text-claude-subtext hover:text-claude-text transition-colors"
        >
          <AlignJustify size={14} />
          Load prompt
        </button>
        <button
          type="button"
          onClick={handleSavePrompt}
          disabled={!currentInput.trim() || savingPrompt}
          className="flex items-center gap-1.5 text-[13px] text-claude-subtext hover:text-claude-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Save size={14} />
          {savingPrompt ? 'Зберігаю...' : 'Save prompt'}
        </button>
      </div>

      {/* Load Prompt Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowLoadModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 p-6" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-[15px] font-semibold text-claude-text mb-4">Завантажити промпт</h3>
            {promptsLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 size={20} className="animate-spin text-claude-subtext" />
              </div>
            ) : savedPrompts.length === 0 ? (
              <p className="text-[13px] text-claude-subtext text-center py-8">Немає збережених промптів</p>
            ) : (
              <ul className="space-y-1 max-h-72 overflow-y-auto -mx-1">
                {savedPrompts.map((p) => (
                  <li
                    key={p.id}
                    onClick={() => handleLoadPrompt(p)}
                    className="flex items-center justify-between px-3 py-2.5 rounded-lg hover:bg-claude-bg cursor-pointer group transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-claude-text truncate">{p.name}</p>
                      <p className="text-[11px] text-claude-subtext truncate mt-0.5">{p.content}</p>
                    </div>
                    <div className="ml-3 flex items-center gap-1 flex-shrink-0">
                      <button
                        type="button"
                        onClick={(e) => handleToggleFavorite(p.id, e)}
                        className={`p-1 transition-all ${p.is_favorite ? 'text-amber-400' : 'text-claude-subtext/30 opacity-0 group-hover:opacity-100 hover:text-amber-400'}`}
                        title={p.is_favorite ? 'Прибрати з обраних' : 'Додати до обраних'}
                      >
                        <Star size={13} fill={p.is_favorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeletePrompt(p.id, e)}
                        className="p-1 text-claude-subtext/30 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                        title="Видалити"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="flex justify-end mt-4">
              <button
                type="button"
                onClick={() => setShowLoadModal(false)}
                className="px-4 py-2 text-[13px] text-claude-subtext hover:text-claude-text transition-colors"
              >
                Закрити
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
