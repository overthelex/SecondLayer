import {
  ArrowLeft,
  Menu,
  Search,
  Download,
  Printer,
  Star,
} from 'lucide-react';
import { mainCodes } from './types';
import type { LegalCodesLibraryPageProps } from './types';
import { useLegalCodes } from './useLegalCodes';
import { TableOfContents } from './TableOfContents';
import { SearchPanel } from './SearchPanel';
import { ArticleViewer } from './ArticleViewer';
import { CodesList } from './CodesList';

export function LegalCodesLibraryPage({ onBack }: LegalCodesLibraryPageProps) {
  const hook = useLegalCodes();

  // Code viewer
  if (hook.selectedCode) {
    const codeInfo = mainCodes.find((c) => c.id === hook.selectedCode);
    const isFavorited = hook.favorites.has(hook.selectedCode);

    return (
      <div className="flex-1 h-full overflow-hidden bg-claude-bg">
        {/* Header */}
        <div className="bg-white border-b border-claude-border p-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => hook.setSelectedCode(null)}
                  className="p-2 hover:bg-claude-bg rounded-lg transition-colors"
                >
                  <ArrowLeft size={20} className="text-claude-text" />
                </button>
                <div>
                  <h1 className="text-xl font-serif text-claude-text font-medium">
                    {codeInfo?.icon || '\uD83D\uDCDC'}{' '}
                    {hook.legislationData?.title || codeInfo?.name || hook.selectedCode}
                  </h1>
                  <p className="text-xs text-claude-subtext font-sans">
                    № {hook.selectedCode}
                    {hook.legislationData?.total_articles
                      ? ` • ${hook.legislationData.total_articles} статей`
                      : ''}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => hook.setShowTableOfContents(!hook.showTableOfContents)}
                  className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-colors"
                  title="Зміст"
                >
                  <Menu size={20} />
                </button>
                <button
                  onClick={() => hook.setShowSearch(!hook.showSearch)}
                  className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-colors"
                  title="Пошук"
                >
                  <Search size={20} />
                </button>
                <button
                  onClick={hook.handleDownload}
                  className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-colors"
                  title="Завантажити"
                >
                  <Download size={20} />
                </button>
                <button
                  onClick={hook.handlePrint}
                  disabled={!hook.currentArticle}
                  className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-colors disabled:opacity-40"
                  title="Друк"
                >
                  <Printer size={20} />
                </button>
                <button
                  onClick={hook.toggleFavorite}
                  className="p-2 text-claude-subtext hover:text-claude-text hover:bg-claude-bg rounded-lg transition-colors"
                  title="В обране"
                >
                  <Star
                    size={20}
                    className={isFavorited ? 'fill-yellow-400 text-yellow-400' : ''}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Search Panel */}
        <SearchPanel
          showSearch={hook.showSearch}
          documentSearch={hook.documentSearch}
          setDocumentSearch={hook.setDocumentSearch}
          handleSearch={hook.handleSearch}
          searchLoading={hook.searchLoading}
          searchResults={hook.searchResults}
          setSearchResults={hook.setSearchResults}
          searchTotal={hook.searchTotal}
          fetchArticle={hook.fetchArticle}
          setShowSearch={hook.setShowSearch}
        />

        {/* Content */}
        <div className="flex h-[calc(100vh-120px)]">
          {/* Table of Contents */}
          <TableOfContents
            showTableOfContents={hook.showTableOfContents}
            legislationData={hook.legislationData}
            loadingStructure={hook.loadingStructure}
            structureError={hook.structureError}
            selectedArticleNumber={hook.selectedArticleNumber}
            expandedSections={hook.expandedSections}
            toggleSection={hook.toggleSection}
            fetchArticle={hook.fetchArticle}
          />

          {/* Main Content */}
          <ArticleViewer
            loadingArticle={hook.loadingArticle}
            loadingStructure={hook.loadingStructure}
            currentArticle={hook.currentArticle}
            currentArticleIndex={hook.currentArticleIndex}
            allArticles={hook.allArticles}
            prevArticle={hook.prevArticle}
            nextArticle={hook.nextArticle}
            showComment={hook.showComment}
            setShowComment={hook.setShowComment}
            commentText={hook.commentText}
            fetchArticle={hook.fetchArticle}
            handleCopy={hook.handleCopy}
            handleCopyLink={hook.handleCopyLink}
            handleSaveComment={hook.handleSaveComment}
          />
        </div>
      </div>
    );
  }

  // Library listing page
  return (
    <CodesList
      onBack={onBack}
      searchQuery={hook.searchQuery}
      setSearchQuery={hook.setSearchQuery}
      globalSearchResults={hook.globalSearchResults}
      setGlobalSearchResults={hook.setGlobalSearchResults}
      globalSearchLoading={hook.globalSearchLoading}
      globalSearchTotal={hook.globalSearchTotal}
      setGlobalSearchTotal={hook.setGlobalSearchTotal}
      showAllCategories={hook.showAllCategories}
      setShowAllCategories={hook.setShowAllCategories}
      handleGlobalSearch={hook.handleGlobalSearch}
      handlePopularQuery={hook.handlePopularQuery}
      handleDownloadCode={hook.handleDownloadCode}
      handleCategorySearch={hook.handleCategorySearch}
      setSelectedCode={hook.setSelectedCode}
      fetchArticle={hook.fetchArticle}
    />
  );
}
