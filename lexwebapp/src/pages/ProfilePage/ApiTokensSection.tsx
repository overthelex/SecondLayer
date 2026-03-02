import { Terminal, Loader2, Trash2, Plus } from 'lucide-react';
import type { UseProfileReturn } from './types';

type ApiTokensSectionProps = Pick<
  UseProfileReturn,
  'mcpTokens' | 'isDeletingToken' | 'handleRevokeMcpToken' | 'setIsTokenModalOpen' | 'setRevealedToken' | 'setNewTokenName'
>;

export function ApiTokensSection({
  mcpTokens,
  isDeletingToken,
  handleRevokeMcpToken,
  setIsTokenModalOpen,
  setRevealedToken,
  setNewTokenName,
}: ApiTokensSectionProps) {
  return (
    <section className="bg-white rounded-2xl border border-claude-border shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-claude-border/50 bg-claude-bg/30">
        <h3 className="text-sm font-semibold text-claude-subtext uppercase tracking-wider">
          MCP Access Tokens
        </h3>
      </div>
      <div className="p-6 space-y-4">
        <p className="text-sm text-claude-subtext">
          Токени для підключення MCP-клієнтів (Claude Code, Claude Desktop, Jan AI) до SecondLayer.
        </p>

        {/* Token list */}
        {mcpTokens.length > 0 ? (
          <div className="space-y-3">
            {mcpTokens.map((token) => (
              <div key={token.id} className="flex items-center justify-between p-3 rounded-xl border border-claude-border/50 hover:bg-claude-bg/50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-claude-bg rounded-lg text-claude-subtext">
                    <Terminal size={18} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-claude-text">{token.name}</div>
                    <div className="text-xs text-claude-subtext font-mono">{token.key}</div>
                    <div className="text-xs text-claude-subtext mt-0.5">
                      Створено: {new Date(token.created_at).toLocaleDateString('uk-UA')}
                      {token.last_used_at && ` · Використано: ${new Date(token.last_used_at).toLocaleDateString('uk-UA')}`}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleRevokeMcpToken(token.id)}
                  disabled={isDeletingToken === token.id}
                  className="p-2 text-claude-subtext hover:text-red-500 transition-colors disabled:opacity-50"
                  title="Відкликати токен"
                >
                  {isDeletingToken === token.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-claude-subtext text-center py-2">
            Немає створених токенів
          </p>
        )}

        {/* Generate Token button */}
        <div className="pt-2">
          <button
            onClick={() => { setIsTokenModalOpen(true); setRevealedToken(null); setNewTokenName(''); }}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-white border border-claude-border text-claude-text rounded-xl font-medium text-sm hover:bg-claude-bg transition-colors"
          >
            <Plus size={16} />
            Створити токен
          </button>
        </div>

        {/* Connection instructions */}
        <div className="mt-4 p-4 bg-claude-bg/50 rounded-xl border border-claude-border/50">
          <h4 className="text-sm font-medium text-claude-text mb-2">Підключення Claude Code</h4>
          <div className="text-xs text-claude-subtext space-y-1 font-mono bg-white p-3 rounded-lg border border-claude-border/50 overflow-x-auto">
            <p>claude mcp add secondlayer \</p>
            <p className="pl-4">--transport sse \</p>
            <p className="pl-4">--url https://mcp.legal.org.ua/v1/sse \</p>
            <p className="pl-4">--header "Authorization: Bearer YOUR_TOKEN"</p>
          </div>
        </div>
      </div>
    </section>
  );
}
