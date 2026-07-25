export interface HistoricalAnalysisPageProps {
  onBack?: () => void;
}

export interface Revision {
  id: number;
  date: string;
  basis: string;
  changes: string;
}

export interface YearlyChange {
  year: string;
  count: number;
}

export interface TopSection {
  name: string;
  changes: number;
}

export interface ChangeType {
  type: string;
  percentage: number;
  color: string;
}

export interface ArticleVersion {
  version: number;
  date: string;
  basis: string;
  changes: string;
  text: string;
}

export type TabId = 'timeline' | 'statistics' | 'comparison' | 'article';

export const revisions: Revision[] = [
  {
    id: 33,
    date: '01.01.2020',
    basis: '27-IX',
    changes: '12 статей',
  },
  {
    id: 32,
    date: '03.09.2019',
    basis: '38-IX',
    changes: 'Технічні',
  },
  {
    id: 31,
    date: '07.02.2019',
    basis: '2680-VIII',
    changes: '3 статті',
  },
  {
    id: 30,
    date: '21.02.2014',
    basis: '742-VII',
    changes: '47 статей',
  },
  {
    id: 29,
    date: '19.09.2013',
    basis: '586-VII',
    changes: 'Редакційні',
  },
];

export const yearlyChanges: YearlyChange[] = [
  { year: '1996', count: 0 },
  { year: '2000', count: 2 },
  { year: '2004', count: 47 },
  { year: '2008', count: 5 },
  { year: '2012', count: 8 },
  { year: '2016', count: 12 },
  { year: '2020', count: 15 },
];

export const topSections: TopSection[] = [
  { name: 'Розділ XII. Конституційний Суд', changes: 15 },
  { name: 'Розділ V. Президент України', changes: 12 },
  { name: 'Розділ VI. Кабінет Міністрів України', changes: 11 },
  { name: 'Розділ IV. Верховна Рада України', changes: 9 },
  { name: 'Розділ VIII. Правосуддя', changes: 8 },
];

export const changeTypes: ChangeType[] = [
  { type: 'Редакційні правки', percentage: 35, color: 'from-blue-500 to-blue-600' },
  { type: 'Зміна повноважень', percentage: 28, color: 'from-green-500 to-green-600' },
  { type: 'Нові положення', percentage: 20, color: 'from-amber-500 to-amber-600' },
  { type: 'Виключення статей', percentage: 10, color: 'from-red-500 to-red-600' },
  { type: 'Перехідні положення', percentage: 7, color: 'from-purple-500 to-purple-600' },
];

export const articleVersions: ArticleVersion[] = [
  {
    version: 7,
    date: '01.01.2020',
    basis: '№ 27-IX від 03.09.2019',
    changes: 'додано пункти 28-33',
    text: 'До повноважень Верховної Ради України належить:\n1) внесення змін до Конституції України...\n2) призначення всеукраїнського референдуму...\n... (33 пункти)',
  },
  {
    version: 6,
    date: '02.06.2016',
    basis: '№ 1401-VIII від 02.06.2016',
    changes: 'редакційні правки в пунктах 12, 15, 23',
    text: 'До повноважень Верховної Ради України належить:\n... (27 пунктів)',
  },
];
