import { useState, useEffect, useCallback } from 'react';
import { Search, FileText, File, Loader2, CheckSquare, Square, ChevronDown } from 'lucide-react';
import { mcpService } from '../../services/api/MCPService';
import type { VaultDocument } from '../../pages/DocumentsPage/types';
import { getFileExtension } from '../../pages/DocumentsPage/types';

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onDocsLoaded: (docs: VaultDocument[]) => void;
  onBack: () => void;
  onNext: () => void;
}

const PAGE_SIZE = 100;

export function DocumentPicker({ selectedIds, onChange, onDocsLoaded, onBack, onNext }: Props) {
  const [docs, setDocs] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const loadDocs = useCallback(async (offset: number, append: boolean) => {
    try {
      const result = await mcpService.callTool('list_documents', {
        limit: PAGE_SIZE,
        offset,
        sortBy: 'uploadedAt',
        sortOrder: 'desc',
      });
      const parsed = result?.result?.content?.[0]?.text
        ? JSON.parse(result.result.content[0].text)
        : result?.result || result;
      const loaded: VaultDocument[] = parsed.documents || [];
      const total = parsed.total ?? parsed.totalCount ?? 0;

      const updated = append ? [...docs, ...loaded] : loaded;
      setDocs(updated);
      setTotalCount(total);
      setHasMore(updated.length < total);
      onDocsLoaded(updated);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, [docs, onDocsLoaded]);

  useEffect(() => {
    setLoading(true);
    loadDocs(0, false).finally(() => setLoading(false));
  }, []);

  const loadMore = async () => {
    setLoadingMore(true);
    await loadDocs(docs.length, true);
    setLoadingMore(false);
  };

  const [selectingAll, setSelectingAll] = useState(false);

  // Load ALL remaining pages and return full doc list
  const loadAllDocs = async (): Promise<VaultDocument[]> => {
    let all = [...docs];
    let offset = all.length;
    while (offset < totalCount) {
      try {
        const result = await mcpService.callTool('list_documents', {
          limit: PAGE_SIZE,
          offset,
          sortBy: 'uploadedAt',
          sortOrder: 'desc',
        });
        const parsed = result?.result?.content?.[0]?.text
          ? JSON.parse(result.result.content[0].text)
          : result?.result || result;
        const loaded: VaultDocument[] = parsed.documents || [];
        if (loaded.length === 0) break;
        all = [...all, ...loaded];
        offset = all.length;
      } catch {
        break;
      }
    }
    setDocs(all);
    setHasMore(false);
    onDocsLoaded(all);
    return all;
  };

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(d => d !== id)
        : [...selectedIds, id]
    );
  };

  const q = search.toLowerCase().trim();
  const filtered = q
    ? docs.filter(d =>
        d.title.toLowerCase().includes(q) ||
        (d.metadata?.originalFilename || '').toLowerCase().includes(q)
      )
    : docs;

  const allFilteredSelected = filtered.length > 0 && filtered.every(d => selectedIds.includes(d.id));

  const toggleAll = async () => {
    if (allFilteredSelected && !hasMore) {
      // Deselect all
      const filteredIds = new Set(filtered.map(d => d.id));
      onChange(selectedIds.filter(id => !filteredIds.has(id)));
    } else {
      // Select all — load remaining pages first if needed
      setSelectingAll(true);
      try {
        const allDocs = hasMore ? await loadAllDocs() : docs;
        const allFiltered = q
          ? allDocs.filter(d =>
              d.title.toLowerCase().includes(q) ||
              (d.metadata?.originalFilename || '').toLowerCase().includes(q)
            )
          : allDocs;
        onChange(allFiltered.map(d => d.id));
      } finally {
        setSelectingAll(false);
      }
    }
  };

  const hasSelected = selectedIds.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 pb-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-claude-subtext" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 border border-claude-border rounded-lg text-sm text-claude-text bg-white focus:outline-none focus:border-claude-subtext/40 transition-colors"
            placeholder="Пошук документів..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={toggleAll}
            disabled={filtered.length === 0 || selectingAll}
            className="flex items-center gap-1.5 text-xs text-claude-subtext hover:text-claude-text transition-colors disabled:opacity-40"
          >
            {selectingAll ? (
              <Loader2 size={14} className="animate-spin" />
            ) : allFilteredSelected && !hasMore ? (
              <CheckSquare size={14} />
            ) : (
              <Square size={14} />
            )}
            {selectingAll
              ? `Завантаження всіх (${docs.length} / ${totalCount})...`
              : allFilteredSelected && !hasMore
                ? 'Зняти вибір'
                : `Вибрати все (${totalCount > filtered.length ? totalCount : filtered.length})`}
          </button>
          {hasSelected && (
            <span className="text-xs text-claude-accent font-medium">
              Вибрано: {selectedIds.length}{totalCount > 0 ? ` / ${totalCount}` : ''}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 min-h-0" style={{ maxHeight: '350px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-claude-subtext">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Завантаження...
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12 text-claude-subtext text-sm">
            У вас ще немає документів
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-claude-subtext text-sm">
            Нічого не знайдено
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map(doc => {
              const ext = getFileExtension(doc);
              const checked = selectedIds.includes(doc.id);
              const date = doc.metadata?.uploadedAt
                ? new Date(doc.metadata.uploadedAt).toLocaleDateString('uk-UA')
                : '';
              return (
                <label
                  key={doc.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    checked ? 'bg-claude-accent/5 border border-claude-accent/20' : 'hover:bg-claude-bg border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded text-claude-accent shrink-0"
                    checked={checked}
                    onChange={() => toggle(doc.id)}
                  />
                  {ext === '.pdf' ? (
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-claude-subtext shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-claude-text truncate">{doc.title}</p>
                    <p className="text-xs text-claude-subtext truncate">
                      {ext && <span className="uppercase">{ext.slice(1)}</span>}
                      {ext && date && ' · '}
                      {date}
                    </p>
                  </div>
                </label>
              );
            })}

            {/* Load More */}
            {hasMore && (
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full flex items-center justify-center gap-2 py-3 text-sm text-claude-subtext hover:text-claude-text transition-colors"
              >
                {loadingMore ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ChevronDown size={14} />
                )}
                {loadingMore ? 'Завантаження...' : `Завантажити ще (${docs.length} / ${totalCount})`}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="flex gap-3 p-5 pt-3 border-t border-claude-border">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 border border-claude-border rounded-lg text-sm text-claude-text hover:bg-claude-bg transition-colors"
        >
          Назад
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 py-2.5 bg-claude-accent text-white rounded-lg text-sm hover:bg-claude-accent/90 transition-colors"
        >
          {hasSelected ? `Продовжити (${selectedIds.length})` : 'Пропустити'}
        </button>
      </div>
    </div>
  );
}
