import { useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import type { CourtCategory, CourtDocsData, SectionState } from './types';
import { formatDate, formatNumber, SectionLoader, SectionError } from './shared';

function CourtDocsCategoryRow({ cat }: { cat: CourtCategory }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-b border-claude-border/30 hover:bg-gray-50/50 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            {expanded ? <ChevronUp size={12} className="text-claude-subtext" /> : <ChevronDown size={12} className="text-claude-subtext" />}
            <span className="font-medium text-xs text-claude-text">{cat.name}</span>
          </div>
          <div className="text-[10px] text-claude-subtext font-mono ml-5">code: {cat.code}</div>
        </td>
        <td className="px-4 py-2.5 text-right">
          <span className="font-mono text-xs font-medium text-claude-text">{formatNumber(cat.total)}</span>
        </td>
        <td className="px-4 py-2.5 text-right">
          {cat.recent > 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 font-mono">
              +{formatNumber(cat.recent)}
            </span>
          ) : (
            <span className="text-xs text-claude-subtext">0</span>
          )}
        </td>
        <td className="px-4 py-2.5 text-xs text-claude-subtext">{formatDate(cat.last_loaded_at)}</td>
        <td className="px-4 py-2.5 text-xs text-claude-subtext">{formatDate(cat.latest_date)}</td>
      </tr>
      {expanded && cat.documents.length > 0 && cat.documents.map((doc) => (
        <tr key={doc.id} className="bg-gray-50/70 border-b border-claude-border/20">
          <td className="px-4 py-2 pl-10" colSpan={2}>
            <div className="text-xs text-claude-text truncate max-w-md" title={doc.title}>{doc.title}</div>
            <div className="text-[10px] text-claude-subtext">
              {doc.court && <span>{doc.court}</span>}
              {doc.case_number && <span className="ml-2 font-mono">{doc.case_number}</span>}
              {doc.dispute_category && <span className="ml-2 text-blue-600">{doc.dispute_category}</span>}
            </div>
          </td>
          <td className="px-4 py-2 text-xs text-claude-subtext">{formatDate(doc.date)}</td>
          <td className="px-4 py-2 text-xs text-claude-subtext" colSpan={2}>{formatDate(doc.loaded_at)}</td>
        </tr>
      ))}
      {expanded && cat.documents.length === 0 && (
        <tr className="bg-gray-50/70 border-b border-claude-border/20">
          <td className="px-4 py-2 pl-10 text-xs text-claude-subtext italic" colSpan={5}>
            Немає нових документів за обраний період
          </td>
        </tr>
      )}
    </>
  );
}

export function CourtDocsSection({
  state,
  onRetry,
}: {
  state: SectionState<CourtDocsData>;
  onRetry: () => void;
}) {
  if (state.loading) return <SectionLoader />;
  if (state.error) return <SectionError message={state.error} onRetry={onRetry} />;
  if (!state.data) return null;

  const { data } = state;

  return (
    <div>
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
        <div className="bg-white rounded-lg border border-claude-border p-3">
          <div className="text-lg font-semibold text-claude-text font-mono">{formatNumber(data.total_court_docs)}</div>
          <div className="text-[10px] text-claude-subtext">Всього судових рішень</div>
        </div>
        <div className="bg-white rounded-lg border border-claude-border p-3">
          <div className="text-lg font-semibold text-green-700 font-mono">+{formatNumber(data.recent_court_docs)}</div>
          <div className="text-[10px] text-claude-subtext">За останні {data.days} днів</div>
        </div>
        <div className="bg-white rounded-lg border border-claude-border p-3">
          <div className="text-lg font-semibold text-claude-text font-mono">{data.categories.length}</div>
          <div className="text-[10px] text-claude-subtext">Видів права</div>
        </div>
      </div>

      {/* Categories table */}
      {data.categories.length > 0 ? (
        <div className="bg-white rounded-xl border border-claude-border shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-claude-border bg-gray-50">
                  <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Вид права</th>
                  <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Всього</th>
                  <th className="text-right px-4 py-2.5 font-medium text-claude-subtext text-xs">Нових</th>
                  <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Завантажено</th>
                  <th className="text-left px-4 py-2.5 font-medium text-claude-subtext text-xs">Дата рішення</th>
                </tr>
              </thead>
              <tbody>
                {data.categories.map((cat) => (
                  <CourtDocsCategoryRow key={cat.code} cat={cat} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-claude-border p-8 text-center">
          <FileText size={24} className="mx-auto mb-2 text-claude-subtext" />
          <p className="text-sm text-claude-subtext">Судові документи ще не завантажені</p>
        </div>
      )}
    </div>
  );
}
