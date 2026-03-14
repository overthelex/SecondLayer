/**
 * Blog page UI translations
 */
import type { AppLanguage } from '../../stores/localeStore';
import type { Article, TranslationMap } from './articles';

interface BlogUIStringsMap {
  tryLexAi: string;
  read: string;
  login: string;
  all: string;
  tech: string;
  forLawyers: string;
  dataSources: string;
  heroTitle: string;
  heroSubtitle: string;
  footerDescription: string;
  shareArticle: string;
  copyLink: string;
  copied: string;
  shareLinkedIn: string;
  shareX: string;
  shareFacebook: string;
  comments: string;
  writeComment: string;
  loginToComment: string;
  loading: string;
  noComments: string;
  anonymous: string;
  delete: string;
}

const uiStrings: Record<AppLanguage, BlogUIStringsMap> = {
  uk: {
    tryLexAi: 'Спробувати LEX AI',
    read: 'Читати',
    login: 'Увійти',
    all: 'Всі',
    tech: 'Tech',
    forLawyers: 'Для юристів',
    dataSources: 'Джерела даних',
    heroTitle: 'LEX AI Blog',
    heroSubtitle: 'Як ми будуємо AI-платформу для юридичної аналітики. Технічні інсайти для розробників та практичні кейси для юристів.',
    footerDescription: 'LEX AI — AI-powered legal research platform',
    shareArticle: 'Поділитися цією статтею:',
    copyLink: 'Копіювати посилання',
    copied: 'Скопійовано!',
    shareLinkedIn: 'Поділитися в LinkedIn',
    shareX: 'Поділитися в X',
    shareFacebook: 'Поділитися у Facebook',
    comments: 'Коментарі',
    writeComment: 'Написати коментар...',
    loginToComment: 'Увійдіть, щоб залишити коментар',
    loading: 'Завантаження...',
    noComments: 'Поки немає коментарів. Будьте першим!',
    anonymous: 'Анонім',
    delete: 'Видалити',
  },
  en: {
    tryLexAi: 'Try LEX AI',
    read: 'Read',
    login: 'Sign In',
    all: 'All',
    tech: 'Tech',
    forLawyers: 'For Lawyers',
    dataSources: 'Data Sources',
    heroTitle: 'LEX AI Blog',
    heroSubtitle: 'How we build an AI platform for legal analytics. Technical insights for developers and practical cases for lawyers.',
    footerDescription: 'LEX AI — AI-powered legal research platform',
    shareArticle: 'Share this article:',
    copyLink: 'Copy link',
    copied: 'Copied!',
    shareLinkedIn: 'Share on LinkedIn',
    shareX: 'Share on X',
    shareFacebook: 'Share on Facebook',
    comments: 'Comments',
    writeComment: 'Write a comment...',
    loginToComment: 'Sign in to leave a comment',
    loading: 'Loading...',
    noComments: 'No comments yet. Be the first!',
    anonymous: 'Anonymous',
    delete: 'Delete',
  },
  ru: {
    tryLexAi: 'Попробовать LEX AI',
    read: 'Читать',
    login: 'Войти',
    all: 'Все',
    tech: 'Tech',
    forLawyers: 'Для юристов',
    dataSources: 'Источники данных',
    heroTitle: 'LEX AI Blog',
    heroSubtitle: 'Как мы строим AI-платформу для юридической аналитики. Технические инсайты для разработчиков и практические кейсы для юристов.',
    footerDescription: 'LEX AI — AI-powered legal research platform',
    shareArticle: 'Поделиться этой статьёй:',
    copyLink: 'Копировать ссылку',
    copied: 'Скопировано!',
    shareLinkedIn: 'Поделиться в LinkedIn',
    shareX: 'Поделиться в X',
    shareFacebook: 'Поделиться в Facebook',
    comments: 'Комментарии',
    writeComment: 'Написать комментарий...',
    loginToComment: 'Войдите, чтобы оставить комментарий',
    loading: 'Загрузка...',
    noComments: 'Пока нет комментариев. Будьте первым!',
    anonymous: 'Аноним',
    delete: 'Удалить',
  },
};

export type BlogUIStrings = BlogUIStringsMap;

export function getBlogUI(lang: AppLanguage): BlogUIStrings {
  return uiStrings[lang] || uiStrings.uk;
}

/**
 * Get a localized version of an article.
 * Falls back to original (Ukrainian) if translation is not available.
 */
export function getLocalizedArticle(
  article: Article,
  lang: AppLanguage,
  translationMaps: Partial<Record<AppLanguage, TranslationMap>>
): Article {
  if (lang === 'uk') return article;

  const map = translationMaps[lang];
  if (!map) return article;

  const translation = map[article.id];
  if (!translation) return article;

  return {
    ...article,
    title: translation.title,
    punchline: translation.punchline,
    readTime: translation.readTime,
    content: translation.content,
  };
}

/**
 * Get all articles localized to the given language.
 */
export function getLocalizedArticles(
  allArticles: Article[],
  lang: AppLanguage,
  translationMaps: Partial<Record<AppLanguage, TranslationMap>>
): Article[] {
  return allArticles.map(a => getLocalizedArticle(a, lang, translationMaps));
}
