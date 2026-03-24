import ReactMarkdown from 'react-markdown';

interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="
      prose prose-zinc max-w-none
      prose-headings:font-semibold prose-headings:tracking-tight prose-headings:text-zinc-900
      prose-h1:text-xl prose-h1:mb-4 prose-h1:mt-0 prose-h1:pb-3 prose-h1:border-b prose-h1:border-zinc-200
      prose-h2:text-base prose-h2:mt-6 prose-h2:mb-3
      prose-h3:text-[13.5px] prose-h3:mt-5 prose-h3:mb-2 prose-h3:text-zinc-700
      prose-p:text-[13.5px] prose-p:text-zinc-700 prose-p:leading-[1.8] prose-p:my-3
      prose-a:text-zinc-900 prose-a:underline prose-a:underline-offset-2 prose-a:decoration-zinc-400 hover:prose-a:decoration-zinc-900 prose-a:transition-all
      prose-strong:text-zinc-900 prose-strong:font-semibold
      prose-em:text-zinc-600
      prose-code:text-[12px] prose-code:bg-zinc-100 prose-code:text-zinc-800 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-code:font-mono prose-code:before:content-none prose-code:after:content-none
      prose-pre:bg-zinc-950 prose-pre:text-zinc-200 prose-pre:border prose-pre:border-zinc-800 prose-pre:rounded-lg prose-pre:text-[12px]
      prose-blockquote:border-l-2 prose-blockquote:border-zinc-300 prose-blockquote:pl-4 prose-blockquote:text-zinc-500 prose-blockquote:italic prose-blockquote:not-italic
      prose-ul:my-3 prose-li:my-1 prose-li:text-[13.5px] prose-li:text-zinc-700
      prose-ol:my-3
      prose-hr:border-zinc-200 prose-hr:my-6
      prose-table:text-[12.5px]
      prose-thead:border-b-2 prose-thead:border-zinc-200
      prose-th:font-semibold prose-th:text-zinc-900 prose-th:py-2 prose-th:px-3
      prose-td:py-2 prose-td:px-3 prose-td:text-zinc-600 prose-td:border-b prose-td:border-zinc-100
    ">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
