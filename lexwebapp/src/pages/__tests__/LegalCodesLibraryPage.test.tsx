import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

// Mock framer-motion — filter must be inline in factory since vi.mock is hoisted
vi.mock('framer-motion', () => {
  const filter = (props: any) => {
    const { initial, animate, exit, transition, whileHover, whileTap, ...rest } = props;
    return rest;
  };
  return {
    motion: {
      div: React.forwardRef(({ children, ...props }: any, ref: any) => (
        <div ref={ref} {...filter(props)}>{children}</div>
      )),
      button: React.forwardRef(({ children, ...props }: any, ref: any) => (
        <button ref={ref} {...filter(props)}>{children}</button>
      )),
    },
    AnimatePresence: ({ children }: any) => <>{children}</>,
  };
});

// Mock toast
vi.mock('../../utils/toast', () => ({
  showToast: {
    error: vi.fn(),
    success: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock mcpService
const mockCallTool = vi.fn();
vi.mock('../../services', () => ({
  mcpService: {
    callTool: (...args: any[]) => mockCallTool(...args),
  },
}));

import { LegalCodesLibraryPage } from '../LegalCodesLibraryPage';
import { showToast } from '../../utils/toast';

function makeToolResult(data: any) {
  return { result: { content: [{ text: JSON.stringify(data) }] } };
}

describe('LegalCodesLibraryPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  describe('Library listing', () => {
    it('renders main codes grid', () => {
      render(<LegalCodesLibraryPage />);
      expect(screen.getByText('Цивільний кодекс')).toBeInTheDocument();
      expect(screen.getByText('Кримінальний кодекс')).toBeInTheDocument();
      expect(screen.getByText('Господарський кодекс')).toBeInTheDocument();
      expect(screen.getByText('Податковий кодекс')).toBeInTheDocument();
    });

    it('renders procedural codes section', () => {
      render(<LegalCodesLibraryPage />);
      expect(screen.getByText('Процесуальні кодекси')).toBeInTheDocument();
      expect(screen.getByText(/Цивільний процесуальний кодекс/)).toBeInTheDocument();
      expect(screen.getByText(/Господарський процесуальний кодекс/)).toBeInTheDocument();
    });

    it('renders constitutional acts section', () => {
      render(<LegalCodesLibraryPage />);
      expect(screen.getByText('Конституційні акти')).toBeInTheDocument();
      expect(screen.getByText(/Конституція України/)).toBeInTheDocument();
    });

    it('renders categories section', () => {
      render(<LegalCodesLibraryPage />);
      expect(screen.getByText('Категорії законів')).toBeInTheDocument();
      expect(screen.getByText('Банківське')).toBeInTheDocument();
      expect(screen.getByText('Митне')).toBeInTheDocument();
    });

    it('renders search input and button', () => {
      render(<LegalCodesLibraryPage />);
      expect(screen.getByPlaceholderText('Введіть назву кодексу або закону...')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Пошук/ })).toBeInTheDocument();
    });

    it('renders popular queries', () => {
      render(<LegalCodesLibraryPage />);
      expect(screen.getByText('конституція')).toBeInTheDocument();
      expect(screen.getByText('цпк')).toBeInTheDocument();
      expect(screen.getByText('цк')).toBeInTheDocument();
    });
  });

  describe('Global search', () => {
    it('calls search_legislation on search button click', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(makeToolResult({ articles: [], total_found: 0 }));

      render(<LegalCodesLibraryPage />);

      const input = screen.getByPlaceholderText('Введіть назву кодексу або закону...');
      await user.type(input, 'цивільний кодекс');

      const searchBtn = screen.getByRole('button', { name: /Пошук/ });
      await user.click(searchBtn);

      expect(mockCallTool).toHaveBeenCalledWith('search_legislation', {
        query: 'цивільний кодекс',
        limit: 20,
      });
    });

    it('calls search_legislation on Enter key', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(makeToolResult({ articles: [], total_found: 0 }));

      render(<LegalCodesLibraryPage />);

      const input = screen.getByPlaceholderText('Введіть назву кодексу або закону...');
      await user.type(input, 'стаття 12{enter}');

      expect(mockCallTool).toHaveBeenCalledWith('search_legislation', {
        query: 'стаття 12',
        limit: 20,
      });
    });

    it('displays search results', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(
        makeToolResult({
          articles: [
            { rada_id: '435-15', article_number: '12', title: 'Тестова стаття', full_text: 'Текст статті' },
          ],
          total_found: 1,
        })
      );

      render(<LegalCodesLibraryPage />);

      const input = screen.getByPlaceholderText('Введіть назву кодексу або закону...');
      await user.type(input, 'тест{enter}');

      await waitFor(() => {
        expect(screen.getByText(/Результати пошуку/)).toBeInTheDocument();
        expect(screen.getByText('Ст. 12. Тестова стаття')).toBeInTheDocument();
      });
    });

    it('shows "nothing found" message for empty results', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(makeToolResult({ articles: [], total_found: 0 }));

      render(<LegalCodesLibraryPage />);

      const input = screen.getByPlaceholderText('Введіть назву кодексу або закону...');
      await user.type(input, 'неіснуючий запит{enter}');

      await waitFor(() => {
        expect(screen.getByText(/Нічого не знайдено/)).toBeInTheDocument();
      });
    });

    it('shows error toast on search failure', async () => {
      const user = userEvent.setup();
      mockCallTool.mockRejectedValue(new Error('Network error'));

      render(<LegalCodesLibraryPage />);

      const input = screen.getByPlaceholderText('Введіть назву кодексу або закону...');
      await user.type(input, 'тест{enter}');

      await waitFor(() => {
        expect(showToast.error).toHaveBeenCalledWith('Network error');
      });
    });

    it('search button is disabled when input is empty', () => {
      render(<LegalCodesLibraryPage />);
      const searchBtn = screen.getByRole('button', { name: /Пошук/ });
      expect(searchBtn).toBeDisabled();
    });
  });

  describe('Popular queries', () => {
    it('triggers search on popular query click', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(makeToolResult({ articles: [], total_found: 0 }));

      render(<LegalCodesLibraryPage />);
      await user.click(screen.getByText('конституція'));

      expect(mockCallTool).toHaveBeenCalledWith('search_legislation', {
        query: 'конституція',
        limit: 20,
      });
    });

    it('sets input value when popular query is clicked', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(makeToolResult({ articles: [], total_found: 0 }));

      render(<LegalCodesLibraryPage />);
      await user.click(screen.getByText('цпк'));

      const input = screen.getByPlaceholderText('Введіть назву кодексу або закону...') as HTMLInputElement;
      expect(input.value).toBe('цпк');
    });
  });

  describe('Open code', () => {
    it('opens code viewer when "Відкрити" is clicked on main code', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(
        makeToolResult({
          rada_id: '435-15',
          title: 'Цивільний кодекс України',
          total_articles: 1308,
          table_of_contents: [],
          articles_summary: [],
        })
      );

      render(<LegalCodesLibraryPage />);

      const openBtns = screen.getAllByText('Відкрити');
      await user.click(openBtns[0]);

      expect(mockCallTool).toHaveBeenCalledWith('get_legislation_structure', { rada_id: '435-15' });

      await waitFor(() => {
        expect(screen.getByText(/Цивільний кодекс України/)).toBeInTheDocument();
      });
    });

    it('opens procedural code when clicked', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(
        makeToolResult({
          rada_id: '1618-15',
          title: 'Цивільний процесуальний кодекс України',
          total_articles: 500,
          table_of_contents: [],
          articles_summary: [],
        })
      );

      render(<LegalCodesLibraryPage />);

      const openBtns = screen.getAllByText('Відкрити');
      // main codes = 8, procedural starts at index 8
      await user.click(openBtns[8]);

      expect(mockCallTool).toHaveBeenCalledWith('get_legislation_structure', { rada_id: '1618-15' });
    });
  });

  describe('Download code', () => {
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;

    beforeEach(() => {
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;
      URL.createObjectURL = vi.fn().mockReturnValue('blob:test');
      URL.revokeObjectURL = vi.fn();
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    });

    it('calls get_legislation_structure and triggers download', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(
        makeToolResult({
          title: 'Цивільний кодекс України',
          articles_summary: [
            { article_number: '1', title: 'Стаття 1' },
            { article_number: '2', title: 'Стаття 2' },
          ],
        })
      );

      const clickMock = vi.fn();
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'a') {
          const el = originalCreateElement('a');
          el.click = clickMock;
          return el;
        }
        return originalCreateElement(tag);
      });

      render(<LegalCodesLibraryPage />);

      const downloadBtns = screen.getAllByTitle('Завантажити зміст');
      await user.click(downloadBtns[0]);

      await waitFor(() => {
        expect(mockCallTool).toHaveBeenCalledWith('get_legislation_structure', { rada_id: '435-15' });
        expect(showToast.success).toHaveBeenCalledWith('Завантажено');
        expect(clickMock).toHaveBeenCalled();
      });

      vi.restoreAllMocks();
    });

    it('shows error toast on download failure', async () => {
      const user = userEvent.setup();
      mockCallTool.mockRejectedValue(new Error('Download failed'));

      render(<LegalCodesLibraryPage />);

      const downloadBtns = screen.getAllByTitle('Завантажити зміст');
      await user.click(downloadBtns[0]);

      await waitFor(() => {
        expect(showToast.error).toHaveBeenCalledWith('Download failed');
      });
    });
  });

  describe('Category buttons', () => {
    it('triggers search when category is clicked', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(makeToolResult({ articles: [], total_found: 0 }));

      render(<LegalCodesLibraryPage />);
      await user.click(screen.getByText('Банківське'));

      expect(mockCallTool).toHaveBeenCalledWith('search_legislation', {
        query: 'Банківське',
        limit: 20,
      });
    });

    it('renders all categories', () => {
      render(<LegalCodesLibraryPage />);
      expect(screen.getByText('Банківське')).toBeInTheDocument();
      expect(screen.getByText('Про нотаріат')).toBeInTheDocument();
    });
  });

  describe('Code viewer', () => {
    async function openCodeViewer() {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(
        makeToolResult({
          rada_id: '435-15',
          title: 'Цивільний кодекс України',
          total_articles: 3,
          table_of_contents: [
            {
              type: 'section',
              number: '1',
              articles: [
                { article_number: '1', title: 'Перша стаття' },
                { article_number: '2', title: 'Друга стаття' },
              ],
            },
          ],
          articles_summary: [
            { article_number: '1', title: 'Перша стаття' },
            { article_number: '2', title: 'Друга стаття' },
            { article_number: '3', title: 'Третя стаття' },
          ],
        })
      );

      render(<LegalCodesLibraryPage />);
      const openBtns = screen.getAllByText('Відкрити');
      await user.click(openBtns[0]);

      await waitFor(() => {
        expect(screen.getByText(/Цивільний кодекс України/)).toBeInTheDocument();
      });

      return user;
    }

    it('shows table of contents with sections', async () => {
      await openCodeViewer();
      expect(screen.getByText('ЗМІСТ')).toBeInTheDocument();
      expect(screen.getByText('3 статей')).toBeInTheDocument();
    });

    it('loads article when clicked in TOC', async () => {
      const user = await openCodeViewer();

      mockCallTool.mockResolvedValue(
        makeToolResult({
          rada_id: '435-15',
          article_number: '1',
          title: 'Перша стаття',
          full_text: 'Текст першої статті',
          url: 'https://example.com/article/1',
        })
      );

      // Section "Розділ 1" is auto-expanded (top 2 sections expanded by default)
      // Find and click an article in the TOC
      const articleBtns = screen.getAllByRole('button').filter(
        btn => btn.textContent?.includes('Ст. 1. Перша стаття')
      );
      await user.click(articleBtns[0]);

      expect(mockCallTool).toHaveBeenCalledWith('get_legislation_article', {
        rada_id: '435-15',
        article_number: '1',
      });

      await waitFor(() => {
        expect(screen.getByText('Текст першої статті')).toBeInTheDocument();
      });
    });

    it('navigates back to listing on back button', async () => {
      const user = await openCodeViewer();

      const buttons = screen.getAllByRole('button');
      // First button in viewer header is the back button
      await user.click(buttons[0]);

      await waitFor(() => {
        expect(screen.getByText('Бібліотека кодексів і законів України')).toBeInTheDocument();
      });
    });

    it('shows placeholder text when no article is selected', async () => {
      await openCodeViewer();
      expect(screen.getByText('Оберіть статтю зі змісту')).toBeInTheDocument();
    });
  });

  describe('Article actions', () => {
    async function openArticle() {
      const user = userEvent.setup();

      // First call: get_legislation_structure
      mockCallTool.mockResolvedValueOnce(
        makeToolResult({
          rada_id: '435-15',
          title: 'Цивільний кодекс України',
          total_articles: 2,
          table_of_contents: [
            { article_number: '1', title: 'Перша стаття' },
            { article_number: '2', title: 'Друга стаття' },
          ],
          articles_summary: [
            { article_number: '1', title: 'Перша стаття' },
            { article_number: '2', title: 'Друга стаття' },
          ],
        })
      );

      render(<LegalCodesLibraryPage />);
      const openBtns = screen.getAllByText('Відкрити');
      await user.click(openBtns[0]);

      await waitFor(() => {
        expect(screen.getByText('ЗМІСТ')).toBeInTheDocument();
      });

      // Second call: get_legislation_article
      mockCallTool.mockResolvedValueOnce(
        makeToolResult({
          rada_id: '435-15',
          article_number: '1',
          title: 'Перша стаття',
          full_text: 'Текст першої статті для копіювання',
          url: 'https://example.com/article/1',
        })
      );

      const articleBtn = screen.getByText(/Ст\. 1\. Перша стаття/);
      await user.click(articleBtn);

      await waitFor(() => {
        expect(screen.getByText('Текст першої статті для копіювання')).toBeInTheDocument();
      });

      return user;
    }

    it('copies article text to clipboard', async () => {
      const user = await openArticle();

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      await user.click(screen.getByText('Копіювати'));

      expect(writeTextMock).toHaveBeenCalledWith(
        expect.stringContaining('Текст першої статті для копіювання')
      );
    });

    it('copies article link to clipboard', async () => {
      const user = await openArticle();

      const writeTextMock = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText: writeTextMock },
        writable: true,
        configurable: true,
      });

      await user.click(screen.getByText('Посилання'));

      expect(writeTextMock).toHaveBeenCalledWith('https://example.com/article/1');
    });

    it('toggles comment panel', async () => {
      const user = await openArticle();

      await user.click(screen.getByText('Коментар'));

      expect(screen.getByPlaceholderText('Додати нотатку до статті...')).toBeInTheDocument();
    });

    it('shows prev/next article navigation', async () => {
      await openArticle();

      expect(screen.getByText('1 / 2')).toBeInTheDocument();
      expect(screen.getByText('Ст. 2')).toBeInTheDocument();
    });
  });

  describe('Favorites', () => {
    it('toggles favorite for a code', async () => {
      const user = userEvent.setup();
      mockCallTool.mockResolvedValue(
        makeToolResult({
          rada_id: '435-15',
          title: 'Цивільний кодекс України',
          total_articles: 0,
          table_of_contents: [],
          articles_summary: [],
        })
      );

      render(<LegalCodesLibraryPage />);
      const openBtns = screen.getAllByText('Відкрити');
      await user.click(openBtns[0]);

      await waitFor(() => {
        expect(screen.getByTitle('В обране')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('В обране'));

      const stored = localStorage.getItem('legislation_favorites');
      expect(stored).toContain('435-15');
    });
  });
});
