import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Globe } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface LegalPageLayoutProps {
  icon: React.ReactNode;
  iconBgClass: string;
  routePath: string;
  contentUk: string;
  contentEn: string;
}

export function LegalPageLayout({
  icon,
  iconBgClass,
  routePath,
  contentUk,
  contentEn,
}: LegalPageLayoutProps) {
  const { lang } = useParams<{ lang: string }>();
  const navigate = useNavigate();

  const currentLang = lang === 'ua' || lang === 'en' ? lang : 'ua';
  const content = currentLang === 'ua' ? contentUk : contentEn;
  const switchTo = currentLang === 'ua' ? 'en' : 'ua';
  const switchLabel = currentLang === 'ua' ? 'English' : 'Українська';
  const backLabel = currentLang === 'ua' ? 'Назад' : 'Back';

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
          >
            <ArrowLeft size={16} />
            {backLabel}
          </button>
          <button
            onClick={() => navigate(`/${switchTo}/${routePath}`, { replace: true })}
            className="flex items-center gap-2 px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors text-gray-700"
          >
            <Globe size={14} />
            {switchLabel}
          </button>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 md:p-12">
          <div className="flex justify-center mb-6">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${iconBgClass}`}>
              {icon}
            </div>
          </div>

          <div className="prose prose-gray max-w-none
            prose-headings:text-gray-900
            prose-h1:text-3xl prose-h1:font-bold prose-h1:text-center prose-h1:mb-2
            prose-h2:text-xl prose-h2:font-semibold prose-h2:mt-8 prose-h2:mb-3
            prose-p:text-gray-700 prose-p:leading-relaxed
            prose-li:text-gray-700
            prose-strong:text-gray-900
            prose-em:text-gray-500
            prose-hr:my-6
            prose-table:text-sm
            prose-th:bg-gray-50 prose-th:px-4 prose-th:py-2
            prose-td:px-4 prose-td:py-2
            prose-a:text-blue-600 prose-a:no-underline hover:prose-a:underline
          ">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        </div>
      </main>

      <footer className="max-w-4xl mx-auto px-4 py-6 text-center">
        <p className="text-xs text-gray-400">
          ТОВ «Лекс ЕйАй» &copy; {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
