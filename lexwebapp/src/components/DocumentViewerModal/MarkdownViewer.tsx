import ReactMarkdown from 'react-markdown';

interface MarkdownViewerProps {
  content: string;
}

export function MarkdownViewer({ content }: MarkdownViewerProps) {
  return (
    <div className="prose prose-sm max-w-none prose-headings:text-claude-text prose-p:text-claude-text prose-p:leading-relaxed prose-a:text-blue-600 prose-strong:text-claude-text prose-code:text-[13px] prose-code:bg-claude-bg prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded prose-pre:bg-claude-bg prose-pre:border prose-pre:border-claude-border prose-blockquote:border-claude-border prose-blockquote:text-claude-subtext">
      <ReactMarkdown>{content}</ReactMarkdown>
    </div>
  );
}
