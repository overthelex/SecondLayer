import { useState, useCallback } from 'react';
import { api } from '@/utils/api-client';
import { tools, type Tool } from '@/utils/tools-data';
import type { useRequestHistory } from './useRequestHistory';

const LAST_KEY = 'playground_last';
const INPUT_MODE_KEY = 'playground_input_mode';

export type InputMode = 'form' | 'json';

function loadLast(): { tool: string; params: string } {
  try {
    const saved = localStorage.getItem(LAST_KEY);
    if (saved) return JSON.parse(saved);
  } catch { /* ignore */ }
  return { tool: tools[0]?.name || '', params: '{}' };
}

function loadInputMode(): InputMode {
  return (localStorage.getItem(INPUT_MODE_KEY) as InputMode) || 'form';
}

export function usePlaygroundState(history: ReturnType<typeof useRequestHistory>) {
  const last = loadLast();
  const [selectedTool, setSelectedTool] = useState(last.tool);
  const [params, setParams] = useState(last.params);
  const [response, setResponse] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [statusCode, setStatusCode] = useState<number | null>(null);
  const [inputMode, setInputModeState] = useState<InputMode>(loadInputMode);

  const toolInfo: Tool | undefined = tools.find(t => t.name === selectedTool);

  const setInputMode = useCallback((mode: InputMode) => {
    setInputModeState(mode);
    localStorage.setItem(INPUT_MODE_KEY, mode);
  }, []);

  const handleExecute = useCallback(async () => {
    setLoading(true);
    setError(null);
    setResponse(null);
    setDuration(null);
    setStatusCode(null);

    localStorage.setItem(LAST_KEY, JSON.stringify({ tool: selectedTool, params }));

    let parsedParams: Record<string, unknown>;
    try {
      parsedParams = JSON.parse(params);
    } catch {
      setError('Invalid JSON');
      setLoading(false);
      return;
    }

    const start = performance.now();
    let code = 0;
    let dur = 0;
    try {
      const res = await api.post(`/tools/${selectedTool}`, { arguments: parsedParams });
      dur = Math.round(performance.now() - start);
      code = res.status;
      setDuration(dur);
      setStatusCode(code);
      setResponse(JSON.stringify(res.data, null, 2));
    } catch (err: unknown) {
      dur = Math.round(performance.now() - start);
      const axiosErr = err as { response?: { status?: number; data?: unknown }; message?: string };
      code = axiosErr.response?.status || 0;
      setDuration(dur);
      setStatusCode(code);
      if (axiosErr.response?.data) {
        setResponse(JSON.stringify(axiosErr.response.data, null, 2));
      }
      setError(axiosErr.message || 'Request failed');
    } finally {
      setLoading(false);
      history.addEntry({ toolName: selectedTool, params, statusCode: code, duration: dur });
    }
  }, [selectedTool, params, history]);

  const handleToolChange = useCallback((name: string) => {
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
  }, []);

  const replayEntry = useCallback((toolName: string, entryParams: string) => {
    setSelectedTool(toolName);
    setParams(entryParams);
    setResponse(null);
    setError(null);
  }, []);

  return {
    selectedTool, params, setParams,
    response, error, loading,
    duration, statusCode,
    toolInfo,
    inputMode, setInputMode,
    handleExecute, handleToolChange, replayEntry,
  };
}
