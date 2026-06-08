/**
 * Admin Session Replay Page
 * View and replay user sessions recorded with rrweb.
 * Shows cursor movements, clicks, scrolling, and correlated server logs.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Play, Clock, User, Monitor, Database, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { sessionReplayApi } from '../utils/api/session-replay';
import 'rrweb-player/dist/style.css';

interface SessionRecord {
  id: string;
  user_id: string;
  session_id: string;
  started_at: string;
  ended_at: string | null;
  chunk_count: number;
  event_count: number;
  total_size_bytes: number;
  user_agent: string | null;
  viewport: string | null;
  user_email?: string;
  user_name?: string;
}

interface ServerLog {
  timestamp: string;
  log_type: string;
  method?: string;
  path?: string;
  status_code?: number;
  duration_ms?: number;
  error_message?: string;
}

interface CostLog {
  tool_name: string;
  user_query: string;
  execution_time_ms: number;
  status: string;
  total_cost_usd: number;
  created_at: string;
}

export function AdminSessionReplayPage() {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [selectedSession, setSelectedSession] = useState<SessionRecord | null>(null);
  const [replayEvents, setReplayEvents] = useState<any[] | null>(null);
  const [serverLogs, setServerLogs] = useState<ServerLog[]>([]);
  const [costLogs, setCostLogs] = useState<CostLog[]>([]);
  const [loadingReplay, setLoadingReplay] = useState(false);
  const replayerContainerRef = useRef<HTMLDivElement>(null);
  const replayerRef = useRef<any>(null);

  const PAGE_SIZE = 20;

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await sessionReplayApi.listSessions({
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      });
      setSessions(res.data.sessions);
      setTotal(res.data.total);
    } catch (err) {
      console.error('Failed to fetch sessions', err);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  const openReplay = async (session: SessionRecord) => {
    setSelectedSession(session);
    setLoadingReplay(true);
    setReplayEvents(null);
    setServerLogs([]);
    setCostLogs([]);

    try {
      const [eventsRes, logsRes] = await Promise.all([
        sessionReplayApi.getSessionEvents(session.session_id),
        sessionReplayApi.getSessionLogs(session.session_id),
      ]);

      setReplayEvents(eventsRes.data.events);
      setServerLogs(logsRes.data.directLogs || []);
      setCostLogs(logsRes.data.costLogs || []);
    } catch (err) {
      console.error('Failed to load replay data', err);
    } finally {
      setLoadingReplay(false);
    }
  };

  // Initialize rrweb-player when events are loaded
  useEffect(() => {
    if (!replayEvents || replayEvents.length === 0 || !replayerContainerRef.current) return;

    // Clean up previous player
    if (replayerRef.current) {
      replayerRef.current = null;
      if (replayerContainerRef.current) {
        replayerContainerRef.current.innerHTML = '';
      }
    }

    import('rrweb-player').then((mod) => {
      const RRWebPlayer = mod.default || mod;
      if (!replayerContainerRef.current) return;

      try {
        const player = new RRWebPlayer({
          target: replayerContainerRef.current,
          props: {
            events: replayEvents,
            width: 1024,
            height: 600,
            autoPlay: false,
            showController: true,
            speedOption: [1, 2, 4, 8],
          },
        });
        replayerRef.current = player;
      } catch (err) {
        console.error('[SessionReplay] Player init failed', err);
      }
    }).catch((err) => {
      console.error('[SessionReplay] Failed to load rrweb-player', err);
    });

    return () => {
      replayerRef.current = null;
    };
  }, [replayEvents]);

  const formatDuration = (startedAt: string, endedAt: string | null) => {
    if (!endedAt) return 'Активна';
    const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}хв ${seconds}с`;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  const formatTime = (ts: string) => {
    return new Date(ts).toLocaleString('uk-UA', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  };

  // Replay view
  if (selectedSession) {
    return (
      <div className="min-h-screen bg-gray-950 text-gray-100 p-4">
        {/* Header */}
        <div className="flex items-center gap-4 mb-4">
          <button
            onClick={() => { setSelectedSession(null); setReplayEvents(null); }}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm"
          >
            <ChevronLeft className="w-4 h-4" /> Назад
          </button>
          <div className="flex-1">
            <h2 className="text-lg font-semibold">
              {selectedSession.user_name || selectedSession.user_email || 'Невідомий'}
            </h2>
            <div className="text-sm text-gray-400 flex items-center gap-4">
              <span><Clock className="w-3 h-3 inline mr-1" />{formatTime(selectedSession.started_at)}</span>
              <span><Monitor className="w-3 h-3 inline mr-1" />{selectedSession.viewport || '?'}</span>
              <span>{selectedSession.event_count} подій, {formatSize(selectedSession.total_size_bytes)}</span>
            </div>
          </div>
        </div>

        {loadingReplay ? (
          <div className="flex items-center justify-center h-96">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            {/* Player */}
            <div className="xl:col-span-2">
              <div className="bg-gray-900 rounded-lg p-4">
                <div ref={replayerContainerRef} className="rrweb-player-container" />
                {replayEvents && replayEvents.length === 0 && (
                  <div className="text-center text-gray-500 py-20">Немає подій для відтворення</div>
                )}
              </div>
            </div>

            {/* Server logs panel */}
            <div className="xl:col-span-1">
              <div className="bg-gray-900 rounded-lg p-4 max-h-[700px] overflow-y-auto">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  <Database className="w-4 h-4" /> Серверні логи
                </h3>

                {/* Direct server logs */}
                {serverLogs.length > 0 && (
                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">API запити</div>
                    {serverLogs.map((log, i) => (
                      <div key={i} className="text-xs mb-2 p-2 bg-gray-800 rounded">
                        <div className="flex items-center gap-2">
                          <span className={`font-mono ${
                            (log.status_code || 0) >= 400 ? 'text-red-400' : 'text-green-400'
                          }`}>
                            {log.method} {log.status_code}
                          </span>
                          <span className="text-gray-400 truncate flex-1">{log.path}</span>
                          {log.duration_ms && (
                            <span className="text-gray-500">{log.duration_ms}ms</span>
                          )}
                        </div>
                        <div className="text-gray-500 mt-1">
                          {formatTime(log.timestamp)}
                        </div>
                        {log.error_message && (
                          <div className="text-red-400 mt-1">{log.error_message}</div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Cost tracking logs */}
                {costLogs.length > 0 && (
                  <div>
                    <div className="text-xs text-gray-500 mb-2 uppercase tracking-wide">Виконання інструментів</div>
                    {costLogs.map((log, i) => (
                      <div key={i} className="text-xs mb-2 p-2 bg-gray-800 rounded">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold ${
                            log.status === 'error' ? 'text-red-400' : 'text-blue-400'
                          }`}>
                            {log.tool_name}
                          </span>
                          <span className="text-gray-500 ml-auto">{log.execution_time_ms}ms</span>
                        </div>
                        {log.user_query && (
                          <div className="text-gray-400 mt-1 truncate">{log.user_query}</div>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-gray-500">{formatTime(log.created_at)}</span>
                          {Number(log.total_cost_usd) > 0 && (
                            <span className="text-yellow-500">${Number(log.total_cost_usd).toFixed(4)}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {serverLogs.length === 0 && costLogs.length === 0 && (
                  <div className="text-gray-500 text-sm text-center py-8">
                    Немає серверних логів для цієї сесії
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Session list view
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Запис сесій користувачів</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchSessions}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm"
          >
            <RefreshCw className="w-4 h-4" /> Оновити
          </button>
        </div>
      </div>

      {/* Sessions table */}
      <div className="bg-gray-900 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="px-4 py-3">Користувач</th>
              <th className="px-4 py-3">Початок</th>
              <th className="px-4 py-3">Тривалість</th>
              <th className="px-4 py-3">Подій</th>
              <th className="px-4 py-3">Розмір</th>
              <th className="px-4 py-3">Екран</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="text-center py-12">
                  <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                </td>
              </tr>
            ) : sessions.length === 0 ? (
              <tr>
                <td colSpan={7} className="text-center py-12 text-gray-500">
                  Немає записаних сесій
                </td>
              </tr>
            ) : sessions.map(session => (
              <tr
                key={session.id}
                className="border-b border-gray-800/50 hover:bg-gray-800/50 cursor-pointer"
                onClick={() => openReplay(session)}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-500" />
                    <div>
                      <div className="font-medium">{session.user_name || 'Невідомий'}</div>
                      <div className="text-xs text-gray-500">{session.user_email}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {formatTime(session.started_at)}
                </td>
                <td className="px-4 py-3">
                  <span className={`${!session.ended_at ? 'text-green-400' : 'text-gray-400'}`}>
                    {formatDuration(session.started_at, session.ended_at)}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {session.event_count.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-gray-400">
                  {formatSize(session.total_size_bytes)}
                </td>
                <td className="px-4 py-3 text-gray-400 font-mono text-xs">
                  {session.viewport || '?'}
                </td>
                <td className="px-4 py-3">
                  <button className="text-blue-400 hover:text-blue-300">
                    <Play className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">
            {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} з {total}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={(page + 1) * PAGE_SIZE >= total}
              className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded text-sm disabled:opacity-50"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
