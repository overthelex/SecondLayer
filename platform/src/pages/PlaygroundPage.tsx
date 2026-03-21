import { useState, useCallback } from 'react';
import { Play, Loader2, Clock, AlertCircle } from 'lucide-react';
import { api } from '@/utils/api-client';
import { tools } from '@/utils/tools-data';

const STORAGE_KEY = 'playground_last';

function loadLast(): { tool: string; params: string } {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return { tool: tools[0]?.name || '', params: '{}' };
}

export function PlaygroundPage() {
  const last = loadLast();
  const [selectedTool, setSelectedTool] = useState(last.tool);
  const [params, setParams] = useState(last.params);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);

  const toolInfo = tools.find(t => t.name === selectedTool);

  const handleExecute = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setDuration(null);
    setStatusCode(null);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tool: selectedTool, params }));

    let parsedParams: Record<string, unknown>;
    try {
      parsedParams = JSON.parse(params);
    } catch {
      setError('Невалідний JSON');
      setLoading(false);
      return;
    }

    const start = performance.now();
    try {
      const res = await api.post(`/tools/${selectedTool}`, { arguments: parsedParams });
      setDuration(Math.round(performance.now() - start));
      setStatusCode(res.status);
      setResponse(JSON.stringify(res.data, null, 2));
    } catch (err: unknown) {
      setDuration(Math.round(performance.now() - start));
      const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      setStatusCode(axiosErr.response?.status || 0);
      if (axiosErr.response?.data) {
        setResponse(JSON.stringify(axiosErr.response.data, null, 2));
      }
      setError(axiosErr.message || 'Помилка запиту');
    } finally {
      setLoading(false);
    }
  }, [selectedTool, params]);

  const handleToolChange = (name: string) => {
    setSelectedTool(name);
    const tool = tools.find(t => t.name === name);
    if (tool?.example?.request) {
      setParams(tool.example.request);
    } else if (tool?.params) {
      const defaultParams: Record<string, string> = {};
      tool.params.filter(p => p.required).forEach(p => { defaultParams[p.name] = ''; });
      setParams(JSON.stringify(defaultParams, null, 2));
    } else {
      setParams('{}');
    }
    setResponse(null);
    setError(null);
  };

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-txt-primary">API Playground</h1>
        <p className="text-sm text-txt-muted mt-1">Тестуйте MCP інструменти в реальному часі</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Request */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-border p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-txt-secondary mb-1">Інструмент</label>
              <select
                value={selectedTool}
                onChange={(e) => handleToolChange(e.target.value)}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white"
              >
                {tools.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.category})
                  </option>
                ))}
              </select>
            </div>

            {toolInfo && (
              <div className="text-xs text-txt-muted bg-surface-secondary rounded-lg p-3">
                <p>{toolInfo.description}</p>
                {toolInfo.cost && <p className="mt-1">Вартість: {toolInfo.cost}</p>}
              </div>
            )}

            {toolInfo?.params && (
              <div>
                <div className="text-xs font-medium text-txt-muted mb-1">Параметри:</div>
                <div className="text-xs text-txt-muted space-y-0.5">
                  {toolInfo.params.map(p => (
                    <div key={p.name}>
                      <code className="text-brand-700">{p.name}</code>
                      <span className="text-txt-muted"> ({p.type}){p.required ? ' *' : ''}</span>
                      <span className="text-txt-muted"> — {p.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-txt-secondary mb-1">Параметри (JSON)</label>
              <textarea
                value={params}
                onChange={(e) => setParams(e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-border rounded-lg text-sm font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y"
                placeholder="{}"
              />
            </div>

            <button
              onClick={handleExecute}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {loading ? (
                <><Loader2 size={16} className="animate-spin" /> Виконується...</>
              ) : (
                <><Play size={16} /> Виконати</>
              )}
            </button>
          </div>
        </div>

        {/* Response */}
        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-border overflow-hidden">
            <div className="px-4 py-3 border-b border-border-light bg-surface-secondary flex items-center justify-between">
              <span className="text-sm font-semibold text-txt-primary">Відповідь</span>
              <div className="flex items-center gap-3 text-xs text-txt-muted">
                {statusCode !== null && (
                  <span className={`font-medium ${statusCode >= 200 && statusCode < 300 ? 'text-green-600' : 'text-red-600'}`}>
                    {statusCode}
                  </span>
                )}
                {duration !== null && (
                  <span className="flex items-center gap-1"><Clock size={12} /> {duration}ms</span>
                )}
              </div>
            </div>

            {error && (
              <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2 text-sm text-red-700">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div className="p-4 max-h-[600px] overflow-auto">
              {response ? (
                <pre className="text-xs font-mono text-txt-primary whitespace-pre-wrap break-words">{response}</pre>
              ) : (
                <div className="text-center py-12 text-txt-muted">
                  <Play size={24} className="mx-auto mb-2 opacity-30" />
                  <p className="text-sm">Виберіть інструмент і натисніть "Виконати"</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
