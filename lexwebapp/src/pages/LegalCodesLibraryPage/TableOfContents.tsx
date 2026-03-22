import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import type { TOCEntry, TOCArticleEntry, TOCSection, TOCChapter, TOCBook, TOCSubsection, TOCParagraph, LegislationStructure } from './types';

interface TableOfContentsProps {
  showTableOfContents: boolean;
  legislationData: LegislationStructure | null;
  loadingStructure: boolean;
  structureError: string | null;
  selectedArticleNumber: string | null;
  expandedSections: string[];
  toggleSection: (id: string) => void;
  fetchArticle: (articleNumber: string) => void;
}

function renderTOCArticle(
  article: TOCArticleEntry,
  key: string,
  level: number,
  selectedArticleNumber: string | null,
  fetchArticle: (articleNumber: string) => void,
) {
  const isSelected = selectedArticleNumber === article.article_number;
  return (
    <div key={key} style={{ marginLeft: `${level * 12}px` }}>
      <button
        onClick={() => fetchArticle(article.article_number)}
        className={`w-full text-left px-2 py-1.5 rounded text-sm font-sans transition-colors flex items-center gap-2 ${
          isSelected
            ? 'bg-claude-accent/10 text-claude-accent font-medium'
            : 'text-claude-text hover:bg-claude-bg'
        }`}
      >
        <span className="w-3.5" />
        <span className="truncate">
          Ст. {article.article_number}. {article.title}
        </span>
      </button>
    </div>
  );
}

const TYPE_LABELS: Record<string, string> = {
  book: 'Книга',
  section: 'Розділ',
  subsection: 'Підрозділ',
  chapter: 'Глава',
  paragraph: '§',
};

function getChildItems(item: TOCBook | TOCSection | TOCSubsection | TOCChapter | TOCParagraph): TOCEntry[] {
  const children: TOCEntry[] = [];

  // Direct articles
  if ('articles' in item && item.articles?.length) {
    children.push(...item.articles);
  }

  // Book children (mixed array)
  if (item.type === 'book' && (item as TOCBook).children?.length) {
    children.push(...(item as TOCBook).children);
  }

  // Subsections (within sections)
  if ('subsections' in item && (item as TOCSection).subsections?.length) {
    children.push(...(item as TOCSection).subsections!);
  }

  // Chapters (within sections or subsections)
  if ('chapters' in item && item.chapters?.length) {
    children.push(...item.chapters);
  }

  // Paragraphs (§)
  if ('paragraphs' in item && item.paragraphs?.length) {
    children.push(...item.paragraphs);
  }

  return children;
}

function renderTOCItems(
  items: TOCEntry[],
  selectedArticleNumber: string | null,
  expandedSections: string[],
  toggleSection: (id: string) => void,
  fetchArticle: (articleNumber: string) => void,
  level = 0,
  parentKey = 'toc',
): React.ReactNode[] {
  return items.map((item, index) => {
    const key = `${parentKey}-${index}`;

    // Article entry (no type field, has article_number)
    if ('article_number' in item && !('type' in item)) {
      return renderTOCArticle(item as TOCArticleEntry, key, level, selectedArticleNumber, fetchArticle);
    }

    // Structural entry (book, section, subsection, chapter, paragraph)
    const typed = item as TOCBook | TOCSection | TOCSubsection | TOCChapter | TOCParagraph;
    const isExpanded = expandedSections.includes(key);
    const prefix = TYPE_LABELS[typed.type] || typed.type;
    const label = typed.title
      ? `${prefix} ${typed.number}. ${typed.title}`
      : `${prefix} ${typed.number}`;

    const children: React.ReactNode[] = [];
    if (isExpanded) {
      const childItems = getChildItems(typed);
      children.push(
        ...renderTOCItems(
          childItems,
          selectedArticleNumber,
          expandedSections,
          toggleSection,
          fetchArticle,
          level + 1,
          key,
        )
      );
    }

    return (
      <div key={key} style={{ marginLeft: `${level * 12}px` }}>
        <button
          onClick={() => toggleSection(key)}
          className="w-full text-left px-2 py-1.5 rounded text-sm font-sans transition-colors flex items-center gap-2 text-claude-text hover:bg-claude-bg font-medium"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span className="truncate">{label}</span>
        </button>
        {isExpanded && <div className="mt-1">{children}</div>}
      </div>
    );
  });
}

export function TableOfContents({
  showTableOfContents,
  legislationData,
  loadingStructure,
  structureError,
  selectedArticleNumber,
  expandedSections,
  toggleSection,
  fetchArticle,
}: TableOfContentsProps) {
  return (
    <AnimatePresence>
      {showTableOfContents && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 300, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          className="bg-white border-r border-claude-border overflow-hidden"
        >
          <div className="h-full overflow-y-auto p-4 scrollbar-hide">
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-claude-text font-sans">
                  ЗМІСТ
                </h3>
                {legislationData && (
                  <span className="text-xs text-claude-subtext font-sans">
                    {legislationData.total_articles} статей
                  </span>
                )}
              </div>
            </div>

            {loadingStructure && (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-claude-accent" />
              </div>
            )}

            {structureError && (
              <div className="text-sm text-red-500 font-sans p-2">
                {structureError}
              </div>
            )}

            {legislationData && !loadingStructure && (
              <div className="space-y-0.5">
                {renderTOCItems(
                  legislationData.table_of_contents,
                  selectedArticleNumber,
                  expandedSections,
                  toggleSection,
                  fetchArticle,
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
