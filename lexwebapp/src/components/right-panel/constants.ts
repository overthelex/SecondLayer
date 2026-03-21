/** Shared label maps and constants for the right panel and its tabs. */

export const STATUS_LABELS: Record<string, string> = {
  active: 'Чинне',
  overturned: 'Скасовано',
  modified: 'Змінено',
};

export const DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Договір',
  legislation: 'Законодавство',
  court_decision: 'Судове рішення',
  internal: 'Внутрішній',
  other: 'Інше',
};

export const SECTION_TYPE_LABELS: Record<string, string> = {
  HEADER: 'Заголовок',
  FACTS: 'Обставини справи',
  COURT_REASONING: 'Мотивувальна частина',
  DECISION: 'Резолютивна частина',
  DISSENT: 'Окрема думка',
  AMOUNTS: 'Суми та компенсації',
  CLAIMS: 'Позовні вимоги',
  LAW_REFERENCES: 'Посилання на закон',
};
