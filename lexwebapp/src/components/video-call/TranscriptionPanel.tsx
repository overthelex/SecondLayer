import React, { useEffect, useRef } from 'react';
import { useVideoCallStore } from '../../stores/videoCallStore';

export const TranscriptionPanel: React.FC = () => {
  const { transcriptSegments, transcriptionLanguage, setTranscriptionLanguage } =
    useVideoCallStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new segments
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcriptSegments]);

  const languageBadge = (lang: string) => {
    const label = lang === 'uk' ? 'UK' : lang === 'ru' ? 'RU' : lang.toUpperCase();
    const color = lang === 'uk' ? 'bg-blue-500/20 text-blue-300' : 'bg-purple-500/20 text-purple-300';
    return (
      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${color}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <h3 className="text-sm font-semibold">Транскрипція</h3>
        <select
          value={transcriptionLanguage}
          onChange={(e) => setTranscriptionLanguage(e.target.value as 'uk' | 'ru')}
          className="text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-300 focus:outline-none focus:border-blue-500"
        >
          <option value="uk">Українська</option>
          <option value="ru">Російська</option>
        </select>
      </div>

      {/* Segments list */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {transcriptSegments.length === 0 && (
          <p className="text-gray-500 text-sm text-center mt-8">
            Транскрипція з'явиться тут...
          </p>
        )}

        {transcriptSegments.map((segment) => (
          <div key={segment.id} className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-400">
                {segment.speakerName || 'Невідомий'}
              </span>
              {languageBadge(segment.language)}
              <span className="text-[10px] text-gray-600">
                {formatTimestamp(segment.timestampMs)}
              </span>
            </div>
            <p
              className={`text-sm leading-relaxed ${
                segment.isFinal ? 'text-gray-200' : 'text-gray-500 italic'
              }`}
            >
              {segment.text}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
};

function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
