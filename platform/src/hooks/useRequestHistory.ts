import { useState, useCallback } from 'react';

const STORAGE_KEY = 'playground_history';
const MAX_ENTRIES = 20;
const MAX_PARAMS_LENGTH = 10_000;

export interface HistoryEntry {
  id: string;
  toolName: string;
  params: string;
  statusCode: number;
  duration: number;
  timestamp: number;
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function persistHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch { /* quota exceeded — silently drop */ }
}

export function useRequestHistory() {
  const [entries, setEntries] = useState<HistoryEntry[]>(loadHistory);

  const addEntry = useCallback((entry: Omit<HistoryEntry, 'id' | 'timestamp'>) => {
    setEntries(prev => {
      const next: HistoryEntry[] = [
        {
          ...entry,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          params: entry.params.length > MAX_PARAMS_LENGTH
            ? entry.params.slice(0, MAX_PARAMS_LENGTH) + '...'
            : entry.params,
        },
        ...prev,
      ].slice(0, MAX_ENTRIES);
      persistHistory(next);
      return next;
    });
  }, []);

  const clearHistory = useCallback(() => {
    setEntries([]);
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  return { entries, addEntry, clearHistory };
}
