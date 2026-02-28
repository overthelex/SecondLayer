import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles,
  Loader2,
  CheckCircle,
  AlertTriangle,
  X,
  Play,
  Square,
  Settings2,
} from 'lucide-react';
import { api } from '../../utils/api-client';
import { showToast } from '../../utils/toast';
import type { ClassificationJob, DocumentStats } from './types';

interface ClassificationPanelProps {
  stats: DocumentStats | null;
  onComplete: () => void;
}

const CONCURRENCY_OPTIONS = [1, 2, 3, 5, 8, 10];

export function ClassificationPanel({ stats, onComplete }: ClassificationPanelProps) {
  const [job, setJob] = useState<ClassificationJob | null>(null);
  const [concurrency, setConcurrency] = useState(3);
  const [starting, setStarting] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const unclassifiedCount = stats ? stats.unclassified + stats.needsReview : 0;

  // Poll job status
  const pollJob = useCallback(async (jobId: string) => {
    try {
      const resp = await api.documents.getClassificationJob(jobId);
      const jobData = resp.data as ClassificationJob;
      setJob(jobData);

      if (jobData.status !== 'running') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
        onComplete();
        if (jobData.status === 'completed') {
          showToast.success(
            `Класифікацію завершено: ${jobData.completed} з ${jobData.total} документів`
          );
        }
      }
    } catch {
      // Job may have expired from memory
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setJob(null);
    }
  }, [onComplete]);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const handleStart = async () => {
    setStarting(true);
    try {
      const resp = await api.documents.startClassification({ concurrency });
      const jobData = resp.data as ClassificationJob;
      setJob(jobData);

      if (jobData.total === 0) {
        showToast.success('Всі документи вже класифіковані');
        setStarting(false);
        return;
      }

      // Start polling
      pollRef.current = setInterval(() => pollJob(jobData.jobId), 1500);
    } catch (err: any) {
      showToast.error('Не вдалося запустити класифікацію');
    } finally {
      setStarting(false);
    }
  };

  const handleCancel = async () => {
    if (!job) return;
    try {
      await api.documents.cancelClassification(job.jobId);
      showToast.success('Класифікацію скасовано');
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      setJob((prev) => prev ? { ...prev, status: 'cancelled' } : null);
      onComplete();
    } catch {
      showToast.error('Не вдалося скасувати');
    }
  };

  const handleDismiss = () => {
    setJob(null);
  };

  const handleDismissQueue = async () => {
    if (!window.confirm('Очистити чергу? Документи залишаться з типом «Інше».')) return;
    setDismissing(true);
    try {
      const resp = await api.documents.dismissClassification();
      const count = resp.data?.dismissed || 0;
      showToast.success(`${count} документів позначено як оброблені`);
      onComplete();
    } catch {
      showToast.error('Не вдалося очистити чергу');
    } finally {
      setDismissing(false);
    }
  };

  if (unclassifiedCount === 0 && !job) return null;

  const isRunning = job?.status === 'running';
  const progress = job && job.total > 0
    ? ((job.completed + job.failed) / job.total) * 100
    : 0;

  return (
    <div className="mb-5">
      <AnimatePresence mode="wait">
        {/* Running or completed job */}
        {job && (
          <motion.div
            key="job"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`rounded-xl border p-4 ${
              job.status === 'completed'
                ? 'bg-green-50 border-green-200'
                : job.status === 'cancelled'
                ? 'bg-gray-50 border-gray-200'
                : 'bg-blue-50 border-blue-200'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                {isRunning ? (
                  <Loader2 size={16} className="text-blue-500 animate-spin" />
                ) : job.status === 'completed' ? (
                  <CheckCircle size={16} className="text-green-500" />
                ) : (
                  <AlertTriangle size={16} className="text-gray-500" />
                )}
                <span className="text-sm font-semibold font-sans text-claude-text">
                  {isRunning
                    ? 'Класифікація документів...'
                    : job.status === 'completed'
                    ? 'Класифікацію завершено'
                    : 'Класифікацію скасовано'}
                </span>
              </div>

              <div className="flex items-center gap-2">
                {job.totalCostUsd > 0 && (
                  <span className="text-xs text-claude-subtext/60 font-sans">
                    ${job.totalCostUsd.toFixed(4)}
                  </span>
                )}
                {isRunning ? (
                  <button
                    onClick={handleCancel}
                    className="p-1 text-red-400 hover:text-red-600 transition-colors"
                    title="Скасувати"
                  >
                    <Square size={14} />
                  </button>
                ) : (
                  <button
                    onClick={handleDismiss}
                    className="p-1 text-claude-subtext/40 hover:text-claude-text transition-colors"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-white/60 rounded-full h-2 mb-2">
              <motion.div
                className={`h-2 rounded-full ${
                  job.status === 'completed'
                    ? 'bg-green-400'
                    : job.status === 'cancelled'
                    ? 'bg-gray-400'
                    : 'bg-blue-400'
                }`}
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-claude-subtext/60 font-sans">
              <span>
                {job.completed + job.failed} / {job.total}
                {job.failed > 0 && (
                  <span className="text-amber-600 ml-1">
                    ({job.failed} потребують уваги)
                  </span>
                )}
              </span>
              <span>{Math.round(progress)}%</span>
            </div>
          </motion.div>
        )}

        {/* Start classification prompt */}
        {!job && unclassifiedCount > 0 && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-xl border border-amber-200 bg-amber-50 p-4"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <span className="text-sm font-sans text-claude-text">
                  <strong>{unclassifiedCount}</strong> документів без класифікації
                </span>
              </div>

              <div className="flex items-center gap-2">
                {/* Concurrency settings */}
                <button
                  onClick={() => setShowSettings(!showSettings)}
                  className={`p-1.5 rounded-lg transition-colors ${
                    showSettings
                      ? 'bg-amber-200 text-amber-700'
                      : 'text-amber-500 hover:bg-amber-100'
                  }`}
                  title="Налаштування"
                >
                  <Settings2 size={14} />
                </button>

                <button
                  onClick={handleStart}
                  disabled={starting || dismissing}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white rounded-lg text-xs font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 font-sans"
                >
                  {starting ? (
                    <Loader2 size={12} className="animate-spin" />
                  ) : (
                    <Play size={12} />
                  )}
                  Класифікувати
                </button>

                <button
                  onClick={handleDismissQueue}
                  disabled={dismissing || starting}
                  className="p-1.5 text-amber-400 hover:text-amber-700 transition-colors disabled:opacity-50"
                  title="Очистити чергу"
                >
                  {dismissing ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <X size={14} />
                  )}
                </button>
              </div>
            </div>

            {/* Settings dropdown */}
            <AnimatePresence>
              {showSettings && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 pt-3 border-t border-amber-200"
                >
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-claude-subtext/70 font-sans whitespace-nowrap">
                      Одночасно документів:
                    </label>
                    <div className="flex gap-1">
                      {CONCURRENCY_OPTIONS.map((n) => (
                        <button
                          key={n}
                          onClick={() => setConcurrency(n)}
                          className={`px-2 py-1 rounded text-xs font-sans font-medium transition-colors ${
                            concurrency === n
                              ? 'bg-amber-500 text-white'
                              : 'bg-white text-claude-subtext border border-amber-200 hover:bg-amber-100'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  <p className="text-xs text-claude-subtext/50 mt-2 font-sans">
                    Використовується модель gpt-5-nano (~$0.0001 за документ). Аналізується перші 2000 символів тексту.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
