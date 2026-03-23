import React, { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { FileSearch } from 'lucide-react';
import { DocumentTemplate } from '../DocumentTemplate';
import { ListTypeContext, MdLi, highlightLegalCodes } from './utils';

interface MarkdownContentProps {
  content: string;
  isStreaming?: boolean;
  openDocByRef: (docId: string) => void;
}

const STREAMING_TAIL_CHARS = 2000;

export const MarkdownContent = React.memo(function MarkdownContent({ content, isStreaming, openDocByRef }: MarkdownContentProps) {
  // During streaming, only parse the last ~2000 chars through ReactMarkdown;
  // show earlier content as pre-formatted text to avoid expensive re-parses.
  const { prefix, markdownContent } = useMemo(() => {
    if (isStreaming && content.length > STREAMING_TAIL_CHARS) {
      const splitAt = content.lastIndexOf('\n', content.length - STREAMING_TAIL_CHARS);
      const idx = splitAt > 0 ? splitAt : content.length - STREAMING_TAIL_CHARS;
      return {
        prefix: content.slice(0, idx),
        markdownContent: content.slice(idx),
      };
    }
    return { prefix: '', markdownContent: content };
  }, [content, isStreaming]);

  const components = useMemo(() => ({
    p: ({ children }: any) => (
      <p className="whitespace-pre-wrap m-0 leading-[1.72] my-2.5 text-zinc-800">
        {React.Children.map(children, (child: any) =>
          typeof child === 'string' ? highlightLegalCodes(child) : child
        )}
      </p>
    ),
    h1: ({ children }: any) => (
      <h1 className="text-[19px] font-semibold mt-8 mb-3 text-zinc-900 tracking-[-0.01em] pb-2.5 border-b border-zinc-200">{children}</h1>
    ),
    h2: ({ children }: any) => (
      <h2 className="text-[16px] font-semibold mt-7 mb-2.5 text-zinc-900 tracking-[-0.01em] pb-2 border-b border-zinc-200/60">{children}</h2>
    ),
    h3: ({ children }: any) => (
      <h3 className="flex items-baseline gap-2 text-[14px] font-semibold mt-5 mb-2 text-zinc-900">
        <span className="flex-shrink-0 w-[2px] h-[13px] self-center rounded-full bg-zinc-400" />
        <span>{children}</span>
      </h3>
    ),
    h4: ({ children }: any) => (
      <h4 className="text-[12px] font-semibold mt-4 mb-1.5 text-zinc-500 uppercase tracking-[0.06em]">{children}</h4>
    ),
    ul: ({ children }: any) => (
      <ListTypeContext.Provider value="ul">
        <ul className="my-3 pl-0 space-y-1 list-none text-claude-text">{children}</ul>
      </ListTypeContext.Provider>
    ),
    ol: ({ children }: any) => (
      <ListTypeContext.Provider value="ol">
        <ol className="my-3 pl-6 space-y-1.5 list-decimal marker:text-claude-accent/80 marker:font-semibold text-claude-text">{children}</ol>
      </ListTypeContext.Provider>
    ),
    li: MdLi,
    strong: ({ children }: any) => (
      <strong className="font-semibold text-claude-text">{children}</strong>
    ),
    em: ({ children }: any) => (
      <em className="italic text-claude-text">{children}</em>
    ),
    blockquote: ({ children }: any) => (
      <blockquote className="my-4 pl-4 pr-3 py-3 border-l-[3px] border-claude-accent/60 bg-claude-sidebar rounded-r-lg text-claude-text/85 text-[15px] leading-relaxed">
        {children}
      </blockquote>
    ),
    hr: () => (
      <hr className="my-5 border-claude-border" />
    ),
    pre: ({ children }: any) => {
      const child = React.Children.toArray(children)[0] as React.ReactElement<any>;
      if (child?.props?.className?.includes('language-document')) {
        const text = String(child.props.children || '').replace(/\n$/, '');
        return <DocumentTemplate content={text} />;
      }
      return (
        <pre className="bg-claude-sidebar border border-claude-border rounded-lg my-3 p-4 overflow-x-auto text-claude-text text-[13px]">{children}</pre>
      );
    },
    code: ({ className, children, ...props }: any) => {
      const isBlock = className?.includes('language-');
      if (isBlock) {
        return <code className={`font-mono text-claude-text ${className || ''}`} {...props}>{children}</code>;
      }
      return (
        <code className="text-[13px] bg-claude-sidebar px-1.5 py-0.5 rounded border border-claude-border font-mono text-claude-text" {...props}>
          {children}
        </code>
      );
    },
    a: ({ href, children }: any) => {
      if (href?.startsWith('#doc-')) {
        const docId = href.slice(5);
        return (
          <button
            onClick={() => openDocByRef(docId)}
            className="inline-flex items-center gap-1 text-claude-text font-medium underline decoration-claude-accent/50 hover:decoration-claude-text cursor-pointer bg-transparent border-0 p-0 text-[inherit] align-baseline"
          >
            <FileSearch size={13} className="flex-shrink-0 opacity-60" strokeWidth={2} />
            {children}
          </button>
        );
      }
      // Internal links (starting with /) navigate in the same tab
      if (href?.startsWith('/')) {
        return <a href={href} className="text-claude-accent font-medium underline decoration-claude-accent/50 hover:decoration-claude-accent">{children}</a>;
      }
      return <a href={href} className="text-claude-text underline decoration-claude-subtext/30 hover:decoration-claude-text" target="_blank" rel="noopener noreferrer">{children}</a>;
    },
    table: ({ children }: any) => (
      <div className="overflow-x-auto my-4 rounded-lg border border-claude-border shadow-sm">
        <table className="w-full text-[13px] text-claude-text border-collapse">{children}</table>
      </div>
    ),
    thead: ({ children }: any) => (
      <thead className="bg-claude-sidebar border-b border-claude-border">{children}</thead>
    ),
    tbody: ({ children }: any) => (
      <tbody className="divide-y divide-claude-border/60">{children}</tbody>
    ),
    tr: ({ children }: any) => (
      <tr className="even:bg-claude-bg/40 hover:bg-claude-sidebar/80 transition-colors">{children}</tr>
    ),
    th: ({ children }: any) => (
      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-claude-subtext uppercase tracking-wide whitespace-nowrap">{children}</th>
    ),
    td: ({ children }: any) => (
      <td className="px-4 py-2.5 text-claude-text align-top">{children}</td>
    ),
  }), [openDocByRef]);

  return (
    <div className="font-sans text-[15px] text-claude-text prose prose-sm max-w-none
      prose-headings:font-sans prose-headings:text-claude-text prose-headings:tracking-tight
      prose-p:leading-[1.72] prose-p:my-2
      prose-code:before:content-none prose-code:after:content-none
      prose-a:text-claude-text prose-a:underline prose-a:decoration-claude-subtext/30 hover:prose-a:decoration-claude-text
      prose-strong:text-claude-text prose-strong:font-semibold
    ">
      {prefix && (
        <div className="whitespace-pre-wrap leading-[1.72] text-claude-text">{prefix}</div>
      )}
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={components}
      >
        {markdownContent}
      </ReactMarkdown>
      {isStreaming && <span className="inline-block w-[1.5px] h-[17px] ml-0.5 bg-zinc-400 animate-pulse align-middle rounded-sm" />}
    </div>
  );
});
