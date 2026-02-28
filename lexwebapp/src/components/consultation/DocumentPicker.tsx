import { useState, useEffect } from 'react';
import { Search, FileText, File, Loader2 } from 'lucide-react';
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

export function DocumentPicker({ selectedIds, onChange, onDocsLoaded, onBack, onNext }: Props) {
  const [docs, setDocs] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const result = await mcpService.callTool('list_documents', {
          limit: 50,
          offset: 0,
          sortBy: 'uploadedAt',
          sortOrder: 'desc',
        });
        const parsed = result?.result?.content?.[0]?.text
          ? JSON.parse(result.result.content[0].text)
          : result?.result || result;
        const loaded = parsed.documents || [];
        setDocs(loaded);
        onDocsLoaded(loaded);
      } catch (err) {
        console.error('Failed to load documents:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

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

  const hasSelected = selectedIds.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 pb-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
            placeholder="Пошук документів..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        {hasSelected && (
          <p className="text-xs text-indigo-600">Вибрано: {selectedIds.length}</p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 min-h-0" style={{ maxHeight: '300px' }}>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Завантаження...
          </div>
        ) : docs.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            У вас ще немає документів
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
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
                    checked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded text-indigo-600 shrink-0"
                    checked={checked}
                    onChange={() => toggle(doc.id)}
                  />
                  {ext === '.pdf' ? (
                    <FileText className="w-4 h-4 text-red-500 shrink-0" />
                  ) : (
                    <File className="w-4 h-4 text-gray-400 shrink-0" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{doc.title}</p>
                    <p className="text-xs text-gray-400 truncate">
                      {ext && <span className="uppercase">{ext.slice(1)}</span>}
                      {ext && date && ' · '}
                      {date}
                    </p>
                  </div>
                </label>
              );
            })}
          </div>
        )}
      </div>

      <div className="flex gap-3 p-5 pt-3 border-t">
        <button
          type="button"
          onClick={onBack}
          className="flex-1 py-2.5 border rounded-lg text-sm hover:bg-gray-50"
        >
          Назад
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 py-2.5 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700"
        >
          {hasSelected ? `Продовжити (${selectedIds.length})` : 'Пропустити'}
        </button>
      </div>
    </div>
  );
}
