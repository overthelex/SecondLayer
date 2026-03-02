import React from 'react';
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

export function MarkdownContent({ content, isStreaming, openDocByRef }: MarkdownContentProps) {
  return (
    <div className="font-sans text-[16px] text-claude-text prose prose-sm max-w-none
      prose-headings:font-sans prose-headings:text-claude-text prose-headings:tracking-tight
      prose-p:leading-[1.7] prose-p:my-2
      prose-code:before:content-none prose-code:after:content-none
      prose-a:text-claude-text prose-a:underline prose-a:decoration-claude-subtext/30 hover:prose-a:decoration-claude-text
      prose-strong:text-claude-text prose-strong:font-semibold
    ">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => (
            <p className="whitespace-pre-wrap m-0 leading-[1.7] my-2 text-claude-text">
              {React.Children.map(children, (child) =>
                typeof child === 'string' ? highlightLegalCodes(child) : child
              )}
            </p>
          ),
          h1: ({ children }) => (
            <h1 className="text-[20px] font-bold mt-7 mb-3 text-claude-text tracking-tight pb-2 border-b border-claude-border">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-[17px] font-semibold mt-6 mb-3 text-claude-text tracking-tight pb-2 border-b border-claude-border/70">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="flex items-baseline gap-2 text-[15px] font-semibold mt-5 mb-2 text-claude-text">
              <span className="flex-shrink-0 w-[3px] h-[14px] self-center rounded-full bg-claude-accent/70" />
              <span>{children}</span>
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-[14px] font-semibold mt-4 mb-1.5 text-claude-subtext uppercase tracking-wide">{children}</h4>
          ),
          ul: ({ children }) => (
            <ListTypeContext.Provider value="ul">
              <ul className="my-3 pl-0 space-y-1 list-none text-claude-text">{children}</ul>
            </ListTypeContext.Provider>
          ),
          ol: ({ children }) => (
            <ListTypeContext.Provider value="ol">
              <ol className="my-3 pl-6 space-y-1.5 list-decimal marker:text-claude-accent/80 marker:font-semibold text-claude-text">{children}</ol>
            </ListTypeContext.Provider>
          ),
          li: MdLi,
          strong: ({ children }) => (
            <strong className="font-semibold text-claude-text">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-claude-text">{children}</em>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-4 pl-4 pr-3 py-3 border-l-[3px] border-claude-accent/60 bg-claude-sidebar rounded-r-lg text-claude-text/85 text-[15px] leading-relaxed">
              {children}
            </blockquote>
          ),
          hr: () => (
            <hr className="my-5 border-claude-border" />
          ),
          pre: ({ children }) => {
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
          a: ({ href, children }) => {
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
            return <a href={href} className="text-claude-text underline decoration-claude-subtext/30 hover:decoration-claude-text" target="_blank" rel="noopener noreferrer">{children}</a>;
          },
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-claude-border shadow-sm">
              <table className="w-full text-[13px] text-claude-text border-collapse">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-claude-sidebar border-b border-claude-border">{children}</thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-claude-border/60">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="even:bg-claude-bg/40 hover:bg-claude-sidebar/80 transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-claude-subtext uppercase tracking-wide whitespace-nowrap">{children}</th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-2.5 text-claude-text align-top">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {isStreaming && <span className="inline-block w-[2px] h-[18px] ml-1 bg-claude-text/40 animate-pulse align-middle rounded-[1px]" />}
    </div>
  );
}
