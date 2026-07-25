import { useState, useCallback, useMemo } from 'react';
import { Copy, Check, Clock, AlertCircle, Play } from 'lucide-react';
import { JsonHighlighter } from './JsonHighlighter';

interface Props {
  response: string | null;
  error: string | null;
  statusCode: number | null;
  duration: number | null;
}

const SIZE_THRESHOLD = 100_000;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ResponseViewer({ response, error, statusCode, duration }: Props) {
  const [copied, setCopied] = useState(false);

  const copyResponse = useCallback(() => {
    if (!response) return;
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }, [response]);

  const parsedData = useMemo(() => {
    if (!response) return null;
    try { return JSON.parse(response); } catch { return null; }
  }, [response]);

  const isLarge = response ? response.length > SIZE_THRESHOLD : false;

  return (
    <div className="bg-white rounded-xl border border-border overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-4 py-2.5 border-b border-border-light bg-surface-secondary flex items-center justify-between">
        <span className="text-sm font-semibold text-txt-primary">Response</span>
        <div className="flex items-center gap-3 text-xs text-txt-muted">
          {statusCode !== null && (
            <span className={`px-1.5 py-0.5 rounded font-mono font-medium ${
              statusCode >= 200 && statusCode < 300
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}>
              {statusCode}
            </span>
          )}
          {duration !== null && (
            <span className="flex items-center gap-1"><Clock size={11} /> {duration}ms</span>
          )}
          {response && (
            <span>{formatBytes(new Blob([response]).size)}</span>
          )}
          {response && (
            <button
              onClick={copyResponse}
              className="flex items-center gap-1 text-txt-muted hover:text-txt-primary transition-colors"
            >
              {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2 text-xs text-red-700">
          <AlertCircle size={13} /> {error}
        </div>
      )}

      {/* Body */}
      <div className="p-4 flex-1 overflow-auto max-h-[calc(100vh-300px)]">
        {parsedData !== null ? (
          <JsonHighlighter data={parsedData} defaultCollapsed={isLarge} />
        ) : response ? (
          <pre className="text-xs font-mono text-txt-primary whitespace-pre-wrap break-words">{response}</pre>
        ) : (
          <div className="text-center py-12 text-txt-muted">
            <Play size={24} className="mx-auto mb-2 opacity-30" />
            <p className="text-sm">Select a tool and click Execute</p>
          </div>
        )}
      </div>
    </div>
  );
}
