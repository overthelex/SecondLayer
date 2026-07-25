import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

interface Props {
  data: unknown;
  defaultCollapsed?: boolean;
}

export function JsonHighlighter({ data, defaultCollapsed = false }: Props) {
  return (
    <pre className="text-xs font-mono leading-relaxed">
      <JsonNode value={data} indent={0} defaultCollapsed={defaultCollapsed} />
    </pre>
  );
}

function JsonNode({ value, indent, path = '', defaultCollapsed }: {
  value: unknown; indent: number; path?: string; defaultCollapsed?: boolean;
}) {
  if (value === null) return <span className="text-purple-600">null</span>;
  if (typeof value === 'boolean') return <span className="text-purple-600">{String(value)}</span>;
  if (typeof value === 'number') return <span className="text-amber-600">{value}</span>;
  if (typeof value === 'string') return <span className="text-emerald-600">"{value}"</span>;

  if (Array.isArray(value)) {
    return <CollapsibleNode items={value} type="array" indent={indent} path={path} defaultCollapsed={defaultCollapsed} />;
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    return <CollapsibleNode items={entries} type="object" indent={indent} path={path} defaultCollapsed={defaultCollapsed} />;
  }

  return <span className="text-txt-muted">{String(value)}</span>;
}

function CollapsibleNode({ items, type, indent, path, defaultCollapsed }: {
  items: unknown[] | [string, unknown][];
  type: 'array' | 'object';
  indent: number;
  path?: string;
  defaultCollapsed?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed && items.length > 3);
  const toggle = useCallback(() => setCollapsed(c => !c), []);

  const open = type === 'array' ? '[' : '{';
  const close = type === 'array' ? ']' : '}';
  const pad = '  '.repeat(indent);
  const innerPad = '  '.repeat(indent + 1);

  if (items.length === 0) {
    return <span className="text-txt-muted">{open}{close}</span>;
  }

  if (collapsed) {
    return (
      <span>
        <button onClick={toggle} className="inline-flex items-center text-txt-muted hover:text-txt-primary">
          <ChevronRight size={10} className="mr-0.5" />
          <span>{open}</span>
        </button>
        <span className="text-txt-muted"> {items.length} items </span>
        <span className="text-txt-muted">{close}</span>
      </span>
    );
  }

  return (
    <span>
      <button onClick={toggle} className="inline-flex items-center text-txt-muted hover:text-txt-primary">
        <ChevronDown size={10} className="mr-0.5" />
        <span>{open}</span>
      </button>
      {'\n'}
      {type === 'object'
        ? (items as [string, unknown][]).map(([key, val], i) => (
            <span key={key}>
              {innerPad}
              <span className="text-brand-700">"{key}"</span>
              <span className="text-txt-muted">: </span>
              <JsonNode value={val} indent={indent + 1} path={`${path}.${key}`} defaultCollapsed={defaultCollapsed} />
              {i < items.length - 1 && <span className="text-txt-muted">,</span>}
              {'\n'}
            </span>
          ))
        : (items as unknown[]).map((val, i) => (
            <span key={i}>
              {innerPad}
              <JsonNode value={val} indent={indent + 1} path={`${path}[${i}]`} defaultCollapsed={defaultCollapsed} />
              {i < items.length - 1 && <span className="text-txt-muted">,</span>}
              {'\n'}
            </span>
          ))
      }
      {pad}{close}
    </span>
  );
}
