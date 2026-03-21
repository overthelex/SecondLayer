import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Briefcase, FolderPlus, Folder, ChevronDown, Loader2, Check,
} from 'lucide-react';
import { useUploadStore } from '../../stores/uploadStore';
import { matterService } from '../../services/api/MatterService';
import { api } from '../../utils/api-client';
import { showToast } from '../../utils/toast';
import type { Matter } from '../../types/models/Matter';

type Destination = 'new-matter' | 'existing-matter' | 'new-folder' | 'existing-folder';

interface Props {
  onComplete: () => void;
}

export function PostUploadDestination({ onComplete }: Props) {
  const items = useUploadStore(s => s.items);
  const pendingDocumentIds = items
    .filter(i => i.status === 'completed' && i.documentId)
    .map(i => i.documentId!);
  const dismissDestinationPicker = onComplete;

  const [destination, setDestination] = useState<Destination>('new-matter');
  const [saving, setSaving] = useState(false);

  // Existing matters
  const [matters, setMatters] = useState<Matter[]>([]);
  const [mattersLoading, setMattersLoading] = useState(false);
  const [selectedMatterId, setSelectedMatterId] = useState('');

  // Folders
  const [folders, setFolders] = useState<string[]>([]);
  const [foldersLoading, setFoldersLoading] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState('');
  const [newFolderName, setNewFolderName] = useState('');

  // Load matters and folders on mount
  useEffect(() => {
    setMattersLoading(true);
    matterService.getMatters({ status: 'open', limit: 100 })
      .then(res => {
        setMatters(res.matters || []);
        if (res.matters?.length > 0) setSelectedMatterId(res.matters[0].id);
      })
      .catch(() => setMatters([]))
      .finally(() => setMattersLoading(false));

    setFoldersLoading(true);
    api.documents.getFolders()
      .then(resp => {
        const f = resp.data.folders || [];
        setFolders(f);
        if (f.length > 0) setSelectedFolder(f[0]);
      })
      .catch(() => setFolders([]))
      .finally(() => setFoldersLoading(false));
  }, []);

  const handleSave = async () => {
    if (pendingDocumentIds.length === 0) return;
    setSaving(true);

    try {
      switch (destination) {
        case 'new-matter': {
          const result = await matterService.autoCreateFromUpload(pendingDocumentIds);
          showToast.success(
            `Створено справу "${result.matter.matter_name}" (${result.documentsAssigned} документів)`
          );
          break;
        }
        case 'existing-matter': {
          if (!selectedMatterId) {
            showToast.error('Оберіть справу');
            setSaving(false);
            return;
          }
          const result = await matterService.assignDocumentsToMatter(selectedMatterId, pendingDocumentIds);
          const matter = matters.find(m => m.id === selectedMatterId);
          showToast.success(
            `Додано ${result.assigned} документів до "${matter?.matter_name || 'справи'}"`
          );
          break;
        }
        case 'new-folder': {
          const folderName = newFolderName.trim() || formatDateFolder();
          await Promise.all(
            pendingDocumentIds.map(id => api.documents.move(id, folderName + '/'))
          );
          showToast.success(`Документи переміщено в папку "${folderName}"`);
          window.dispatchEvent(new CustomEvent('vault-folders-changed'));
          break;
        }
        case 'existing-folder': {
          if (!selectedFolder) {
            showToast.error('Оберіть папку');
            setSaving(false);
            return;
          }
          await Promise.all(
            pendingDocumentIds.map(id => api.documents.move(id, selectedFolder + '/'))
          );
          showToast.success(`Документи переміщено в папку "${selectedFolder}"`);
          break;
        }
      }

      dismissDestinationPicker();
      onComplete();
    } catch (err) {
      console.error('[PostUploadDestination]', err);
      showToast.error('Не вдалося зберегти. Спробуйте ще раз.');
    } finally {
      setSaving(false);
    }
  };

  const options: { value: Destination; label: string; icon: typeof Briefcase }[] = [
    { value: 'new-matter', label: 'Нова справа', icon: Briefcase },
    { value: 'existing-matter', label: 'Існуюча справа', icon: Briefcase },
    { value: 'new-folder', label: 'Мої документи / нова папка', icon: FolderPlus },
    { value: 'existing-folder', label: 'Мої документи / існуюча папка', icon: Folder },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-claude-accent/30 shadow-sm overflow-hidden mb-6"
    >
      <div className="px-5 py-3 border-b border-claude-border/50 bg-claude-accent/5">
        <h3 className="text-sm font-semibold text-claude-text font-sans">
          Куди додати {pendingDocumentIds.length} документів?
        </h3>
      </div>

      <div className="px-5 py-4 space-y-2">
        {options.map(opt => {
          const Icon = opt.icon;
          const isSelected = destination === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => setDestination(opt.value)}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-left text-[13px] font-medium transition-all font-sans ${
                isSelected
                  ? 'bg-claude-accent/10 text-claude-accent border border-claude-accent/30'
                  : 'text-claude-text hover:bg-claude-bg border border-transparent'
              }`}
            >
              <Icon size={16} strokeWidth={2} className={isSelected ? 'text-claude-accent' : 'text-claude-subtext/60'} />
              {opt.label}
              {isSelected && <Check size={14} className="ml-auto text-claude-accent" />}
            </button>
          );
        })}

        {/* Conditional inputs */}
        {destination === 'existing-matter' && (
          <div className="pl-11 pt-1">
            {mattersLoading ? (
              <div className="flex items-center gap-2 text-xs text-claude-subtext py-2">
                <Loader2 size={14} className="animate-spin" /> Завантаження справ...
              </div>
            ) : matters.length === 0 ? (
              <p className="text-xs text-claude-subtext py-2">Немає відкритих справ. Оберіть "Нова справа".</p>
            ) : (
              <div className="relative">
                <select
                  value={selectedMatterId}
                  onChange={e => setSelectedMatterId(e.target.value)}
                  className="w-full appearance-none text-[13px] border border-claude-border rounded-xl px-3 py-2 pr-8 bg-white text-claude-text font-sans focus:outline-none focus:border-claude-accent/50"
                >
                  {matters.map(m => (
                    <option key={m.id} value={m.id}>{m.matter_name}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-claude-subtext/50 pointer-events-none" />
              </div>
            )}
          </div>
        )}

        {destination === 'new-folder' && (
          <div className="pl-11 pt-1">
            <input
              type="text"
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder={formatDateFolder()}
              className="w-full text-[13px] border border-claude-border rounded-xl px-3 py-2 bg-white text-claude-text font-sans placeholder:text-claude-subtext/40 focus:outline-none focus:border-claude-accent/50"
            />
          </div>
        )}

        {destination === 'existing-folder' && (
          <div className="pl-11 pt-1">
            {foldersLoading ? (
              <div className="flex items-center gap-2 text-xs text-claude-subtext py-2">
                <Loader2 size={14} className="animate-spin" /> Завантаження папок...
              </div>
            ) : folders.length === 0 ? (
              <p className="text-xs text-claude-subtext py-2">Немає папок. Оберіть "нова папка".</p>
            ) : (
              <div className="relative">
                <select
                  value={selectedFolder}
                  onChange={e => setSelectedFolder(e.target.value)}
                  className="w-full appearance-none text-[13px] border border-claude-border rounded-xl px-3 py-2 pr-8 bg-white text-claude-text font-sans focus:outline-none focus:border-claude-accent/50"
                >
                  {folders.map(f => (
                    <option key={f} value={f}>{f}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-claude-subtext/50 pointer-events-none" />
              </div>
            )}
          </div>
        )}
      </div>

      <div className="px-5 py-3 border-t border-claude-border/50 flex items-center justify-between">
        <button
          onClick={() => { dismissDestinationPicker(); onComplete(); }}
          className="text-xs text-claude-subtext hover:text-claude-text transition-colors font-sans"
        >
          Пропустити
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-4 py-2 bg-claude-text text-white rounded-xl text-sm font-medium hover:bg-claude-text/90 transition-all active:scale-[0.98] shadow-sm font-sans disabled:opacity-60"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : null}
          Зберегти
        </button>
      </div>
    </motion.div>
  );
}

function formatDateFolder(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
