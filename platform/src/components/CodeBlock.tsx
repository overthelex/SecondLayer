import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
}

export function CodeBlock({ code, title }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {title && (
        <div className="bg-surface-tertiary px-4 py-2 border-b border-border flex items-center justify-between">
          <span className="text-xs font-medium text-txt-muted">{title}</span>
          <button
            onClick={handleCopy}
            className="text-txt-muted hover:text-txt-primary transition-colors"
          >
            {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
          </button>
        </div>
      )}
      <div className="relative">
        {!title && (
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 p-1.5 text-gray-400 hover:text-gray-200 transition-colors"
          >
            {copied ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
          </button>
        )}
        <pre className="bg-sidebar-bg text-gray-200 p-4 text-sm font-mono overflow-x-auto">
          <code>{code}</code>
        </pre>
      </div>
    </div>
  );
}
