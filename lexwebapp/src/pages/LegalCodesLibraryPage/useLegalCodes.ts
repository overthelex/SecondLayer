import { useState, useEffect, useCallback } from 'react';
import { mcpService } from '../../services';
import { showToast } from '../../utils/toast';
import { toastT } from '../../i18n/toast-i18n';
import { getErrorMessage } from '../../utils/errors';
import {
  LegislationStructure,
  ArticleData,
  SearchResult,
  TOCArticleEntry,
  loadFavorites,
  saveFavorites,
  loadComment,
  saveComment,
  parseToolResult,
} from './types';

export function useLegalCodes() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);
  const [showTableOfContents, setShowTableOfContents] = useState(true);
  const [expandedSections, setExpandedSections] = useState<string[]>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [documentSearch, setDocumentSearch] = useState('');

  // Dynamic data state
  const [legislationData, setLegislationData] = useState<LegislationStructure | null>(null);
  const [currentArticle, setCurrentArticle] = useState<ArticleData | null>(null);
  const [loadingStructure, setLoadingStructure] = useState(false);
  const [loadingArticle, setLoadingArticle] = useState(false);
  const [structureError, setStructureError] = useState<string | null>(null);
  const [selectedArticleNumber, setSelectedArticleNumber] = useState<string | null>(null);

  // Search state
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchTotal, setSearchTotal] = useState(0);

  // Favorites
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites);

  // Comment state
  const [showComment, setShowComment] = useState(false);
  const [commentText, setCommentText] = useState('');

  // Global search from listing page
  const [globalSearchResults, setGlobalSearchResults] = useState<SearchResult[]>([]);
  const [globalSearchLoading, setGlobalSearchLoading] = useState(false);
  const [globalSearchTotal, setGlobalSearchTotal] = useState(0);
  const [showAllCategories, setShowAllCategories] = useState(false);

  // All articles list for prev/next navigation
  const allArticles = legislationData?.articles_summary || [];

  const handleGlobalSearch = useCallback(async (query?: string) => {
    const q = (query || searchQuery).trim();
    if (!q) return;
    setGlobalSearchLoading(true);
    setGlobalSearchResults([]);
    setGlobalSearchTotal(0);
    try {
      const result = await mcpService.callTool('search_legislation', { query: q, limit: 20 });
      const data = parseToolResult(result);
      setGlobalSearchResults(data.articles || []);
      setGlobalSearchTotal(data.total_found || 0);
    } catch (err: unknown) {
      showToast.error(getErrorMessage(err));
    } finally {
      setGlobalSearchLoading(false);
    }
  }, [searchQuery]);

  const handlePopularQuery = useCallback((query: string) => {
    setSearchQuery(query);
    handleGlobalSearch(query);
  }, [handleGlobalSearch]);

  const handleDownloadCode = useCallback(async (codeNumber: string, codeName: string) => {
    showToast.info(toastT('loadingStructure'));
    try {
      const result = await mcpService.callTool('get_legislation_structure', { rada_id: codeNumber });
      const data = parseToolResult(result);
      if (data.error) {
        showToast.error(data.error);
        return;
      }
      const articles = data.articles_summary || [];
      let content = `${data.title || codeName}\n№ ${codeNumber}\n\nЗМІСТ\n\n`;
      content += articles.map((a: TOCArticleEntry) => `Стаття ${a.article_number}. ${a.title}`).join('\n');
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${codeName.replace(/\s+/g, '_')}_зміст.txt`;
      a.click();
      URL.revokeObjectURL(url);
      showToast.success(toastT('loaded'));
    } catch (err: unknown) {
      showToast.error(getErrorMessage(err));
    }
  }, []);

  const handleCategorySearch = useCallback((category: string) => {
    setSearchQuery(category);
    handleGlobalSearch(category);
  }, [handleGlobalSearch]);

  // Fetch legislation structure when code is selected
  useEffect(() => {
    if (!selectedCode) {
      setLegislationData(null);
      setCurrentArticle(null);
      setSelectedArticleNumber(null);
      setStructureError(null);
      setSearchResults([]);
      setShowComment(false);
      return;
    }

    let cancelled = false;
    setLoadingStructure(true);
    setStructureError(null);
    setCurrentArticle(null);
    setSelectedArticleNumber(null);
    setSearchResults([]);
    setShowComment(false);

    (async () => {
      try {
        const result = await mcpService.callTool('get_legislation_structure', { rada_id: selectedCode });
        if (cancelled) return;
        const data = parseToolResult(result);
        if (data.error) {
          setStructureError(data.error);
        } else {
          setLegislationData(data);
          const topIds = (data.table_of_contents || [])
            .filter((e: any) => e.type === 'section' || e.type === 'chapter')
            .slice(0, 2)
            .map((_: any, i: number) => `toc-${i}`);
          setExpandedSections(topIds);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setStructureError(getErrorMessage(err));
        }
      } finally {
        if (!cancelled) setLoadingStructure(false);
      }
    })();

    return () => { cancelled = true; };
  }, [selectedCode]);

  // Load comment when article changes
  useEffect(() => {
    if (currentArticle && selectedCode) {
      setCommentText(loadComment(selectedCode, currentArticle.article_number));
    }
  }, [currentArticle, selectedCode]);

  const fetchArticle = useCallback(async (articleNumber: string) => {
    if (!selectedCode) return;
    setLoadingArticle(true);
    setSelectedArticleNumber(articleNumber);
    setShowComment(false);
    try {
      const result = await mcpService.callTool('get_legislation_article', {
        rada_id: selectedCode,
        article_number: articleNumber,
      });
      const data = parseToolResult(result);
      if (data.error) {
        showToast.error(data.error);
        setCurrentArticle(null);
      } else {
        setCurrentArticle(data);
      }
    } catch (err: unknown) {
      showToast.error(getErrorMessage(err));
      setCurrentArticle(null);
    } finally {
      setLoadingArticle(false);
    }
  }, [selectedCode]);

  const handleSearch = useCallback(async () => {
    if (!documentSearch.trim()) return;
    setSearchLoading(true);
    setSearchResults([]);
    try {
      const params: any = { query: documentSearch.trim(), limit: 20 };
      if (selectedCode) params.rada_id = selectedCode;
      const result = await mcpService.callTool('search_legislation', params);
      const data = parseToolResult(result);
      setSearchResults(data.articles || []);
      setSearchTotal(data.total_found || 0);
    } catch (err: unknown) {
      showToast.error(getErrorMessage(err));
    } finally {
      setSearchLoading(false);
    }
  }, [documentSearch, selectedCode]);

  const toggleSection = (id: string) => {
    setExpandedSections((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]
    );
  };

  const toggleFavorite = () => {
    if (!selectedCode) return;
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(selectedCode)) {
        next.delete(selectedCode);
      } else {
        next.add(selectedCode);
      }
      saveFavorites(next);
      return next;
    });
  };

  const handleCopy = () => {
    if (!currentArticle) return;
    const text = `${currentArticle.title}\n\n${currentArticle.full_text}`;
    navigator.clipboard.writeText(text).then(() => {
      showToast.success(toastT('copied'));
    }).catch(() => {
      showToast.error(toastT('copyFailed'));
    });
  };

  const handleCopyLink = () => {
    if (!currentArticle?.url) {
      showToast.info(toastT('linkUnavailable'));
      return;
    }
    navigator.clipboard.writeText(currentArticle.url).then(() => {
      showToast.success(toastT('linkCopied'));
    }).catch(() => {
      showToast.error(toastT('copyFailed'));
    });
  };

  const handleSaveComment = (text: string) => {
    if (!selectedCode || !currentArticle) return;
    setCommentText(text);
    saveComment(selectedCode, currentArticle.article_number, text);
  };

  const handlePrint = () => {
    if (!currentArticle) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    const htmlContent = [
      '<!DOCTYPE html>',
      '<html><head><title>' + currentArticle.title + '</title>',
      '<style>body { font-family: serif; max-width: 800px; margin: 40px auto; padding: 20px; }',
      'h1 { font-size: 18px; } p { line-height: 1.6; white-space: pre-wrap; }</style>',
      '</head><body>',
      '<h1>' + currentArticle.title + '</h1>',
      '<p>' + currentArticle.full_text + '</p>',
      '</body></html>',
    ].join('\n');
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.print();
  };

  const handleDownload = () => {
    if (!currentArticle && !legislationData) return;
    let content: string;
    let filename: string;
    if (currentArticle) {
      content = `${currentArticle.title}\n\n${currentArticle.full_text}`;
      filename = `${legislationData?.short_title || selectedCode}_ст_${currentArticle.article_number}.txt`;
    } else {
      content = `${legislationData?.title || selectedCode}\n\nЗМІСТ\n\n`;
      content += allArticles.map(a => `Стаття ${a.article_number}. ${a.title}`).join('\n');
      filename = `${legislationData?.short_title || selectedCode}_зміст.txt`;
    }
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Navigate to prev/next article
  const currentArticleIndex = allArticles.findIndex(
    (a) => a.article_number === selectedArticleNumber
  );
  const prevArticle = currentArticleIndex > 0 ? allArticles[currentArticleIndex - 1] : null;
  const nextArticle = currentArticleIndex < allArticles.length - 1 ? allArticles[currentArticleIndex + 1] : null;

  return {
    // State
    searchQuery,
    setSearchQuery,
    selectedCode,
    setSelectedCode,
    showTableOfContents,
    setShowTableOfContents,
    expandedSections,
    showSearch,
    setShowSearch,
    documentSearch,
    setDocumentSearch,
    legislationData,
    currentArticle,
    loadingStructure,
    loadingArticle,
    structureError,
    selectedArticleNumber,
    searchResults,
    setSearchResults,
    searchLoading,
    searchTotal,
    favorites,
    showComment,
    setShowComment,
    commentText,
    globalSearchResults,
    setGlobalSearchResults,
    globalSearchLoading,
    globalSearchTotal,
    setGlobalSearchTotal,
    showAllCategories,
    setShowAllCategories,
    allArticles,
    currentArticleIndex,
    prevArticle,
    nextArticle,

    // Actions
    handleGlobalSearch,
    handlePopularQuery,
    handleDownloadCode,
    handleCategorySearch,
    fetchArticle,
    handleSearch,
    toggleSection,
    toggleFavorite,
    handleCopy,
    handleCopyLink,
    handleSaveComment,
    handlePrint,
    handleDownload,
  };
}
