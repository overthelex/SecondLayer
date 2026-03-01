import { useState, useEffect } from 'react';
import { Search, MessageSquare, Loader2 } from 'lucide-react';
import { conversationService, type Conversation } from '../../services/api/ConversationService';

interface Props {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  onConversationsLoaded: (convs: Conversation[]) => void;
  onBack: () => void;
  onNext: () => void;
}

export function ConversationPicker({ selectedIds, onChange, onConversationsLoaded, onBack, onNext }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const result = await conversationService.list({ limit: 50, offset: 0 });
        const loaded = result.conversations ?? [];
        setConversations(loaded);
        onConversationsLoaded(loaded);
      } catch (err) {
        console.error('Failed to load conversations:', err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const toggle = (id: string) => {
    onChange(
      selectedIds.includes(id)
        ? selectedIds.filter(c => c !== id)
        : [...selectedIds, id]
    );
  };

  const q = search.toLowerCase().trim();
  const filtered = q
    ? conversations.filter(c => (c.title || '').toLowerCase().includes(q))
    : conversations;

  const hasSelected = selectedIds.length > 0;

  return (
    <div className="flex flex-col h-full">
      <div className="p-5 pb-3 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            className="w-full pl-9 pr-3 py-2 border rounded-md text-sm"
            placeholder="Пошук чатів..."
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
        ) : conversations.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            У вас ще немає чатів
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400 text-sm">
            Нічого не знайдено
          </div>
        ) : (
          <div className="space-y-1">
            {filtered.map(conv => {
              const checked = selectedIds.includes(conv.id);
              const date = conv.updated_at
                ? new Date(conv.updated_at).toLocaleDateString('uk-UA')
                : '';
              return (
                <label
                  key={conv.id}
                  className={`flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-colors ${
                    checked ? 'bg-indigo-50 border border-indigo-200' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="rounded text-indigo-600 shrink-0"
                    checked={checked}
                    onChange={() => toggle(conv.id)}
                  />
                  <MessageSquare className="w-4 h-4 text-indigo-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{conv.title || 'Без назви'}</p>
                    <p className="text-xs text-gray-400 truncate">{date}</p>
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
