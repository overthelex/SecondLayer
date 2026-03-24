import { useEffect, useCallback } from 'react';
import { Play, Loader2, Code, FormInput } from 'lucide-react';
import { usePlaygroundState } from '@/hooks/usePlaygroundState';
import { useRequestHistory } from '@/hooks/useRequestHistory';
import { ToolSidebar } from '@/components/playground/ToolSidebar';
import { ToolDetail } from '@/components/playground/ToolDetail';
import { ParamFormBuilder } from '@/components/playground/ParamFormBuilder';
import { ParamJsonEditor } from '@/components/playground/ParamJsonEditor';
import { ResponseViewer } from '@/components/playground/ResponseViewer';
import { RequestHistory } from '@/components/playground/RequestHistory';

export function PlaygroundPage() {
  const history = useRequestHistory();
  const state = usePlaygroundState(history);

  // Ctrl+Enter to execute
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !state.loading) {
        e.preventDefault();
        state.handleExecute();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [state.handleExecute, state.loading]);

  const handleFillExample = useCallback(() => {
    if (state.toolInfo?.example?.request) {
      state.setParams(state.toolInfo.example.request);
    }
  }, [state.toolInfo, state.setParams]);

  const hasFormParams = !!(state.toolInfo?.params && state.toolInfo.params.length > 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-txt-primary">API Playground</h1>
        <p className="text-sm text-txt-muted mt-1">Test MCP tools in real time. <span className="text-txt-muted/60">Ctrl+Enter to execute</span></p>
      </div>

      <div className="flex gap-4" style={{ height: 'calc(100vh - 160px)' }}>
        {/* Left: Tool Sidebar */}
        <ToolSidebar
          selectedTool={state.selectedTool}
          onSelectTool={state.handleToolChange}
        />

        {/* Center: Request */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 overflow-y-auto">
          {state.toolInfo && (
            <ToolDetail tool={state.toolInfo} onFillExample={handleFillExample} />
          )}

          {/* Form/JSON Toggle */}
          <div className="bg-white rounded-xl border border-border p-4 space-y-3">
            {hasFormParams && (
              <div className="flex items-center gap-1 bg-surface-secondary rounded-lg p-0.5 w-fit">
                <button
                  onClick={() => state.setInputMode('form')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    state.inputMode === 'form'
                      ? 'bg-white text-txt-primary shadow-sm'
                      : 'text-txt-muted hover:text-txt-primary'
                  }`}
                >
                  <FormInput size={12} /> Form
                </button>
                <button
                  onClick={() => state.setInputMode('json')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                    state.inputMode === 'json'
                      ? 'bg-white text-txt-primary shadow-sm'
                      : 'text-txt-muted hover:text-txt-primary'
                  }`}
                >
                  <Code size={12} /> JSON
                </button>
              </div>
            )}

            {state.inputMode === 'form' && hasFormParams ? (
              <ParamFormBuilder
                params={state.toolInfo!.params!}
                value={state.params}
                onChange={state.setParams}
              />
            ) : (
              <ParamJsonEditor value={state.params} onChange={state.setParams} />
            )}

            <button
              onClick={state.handleExecute}
              disabled={state.loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-600 text-white rounded-lg text-sm font-medium hover:bg-brand-700 transition-colors disabled:opacity-50"
            >
              {state.loading ? (
                <><Loader2 size={16} className="animate-spin" /> Executing...</>
              ) : (
                <><Play size={16} /> Execute</>
              )}
            </button>
          </div>
        </div>

        {/* Right: Response + History */}
        <div className="w-[45%] shrink-0 flex flex-col gap-4 min-w-0">
          <div className="flex-1 min-h-0">
            <ResponseViewer
              response={state.response}
              error={state.error}
              statusCode={state.statusCode}
              duration={state.duration}
            />
          </div>
          <RequestHistory
            entries={history.entries}
            onReplay={state.replayEntry}
            onClear={history.clearHistory}
          />
        </div>
      </div>
    </div>
  );
}
