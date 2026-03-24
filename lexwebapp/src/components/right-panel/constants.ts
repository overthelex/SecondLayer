/** Shared label maps and constants for the right panel and its tabs. */

import { getLegalT } from '../../i18n/legal-i18n';

export function getStatusLabels(): Record<string, string> {
  const t = getLegalT();
  return {
    active: t.statusActiveDecision,
    overturned: t.statusOverturned,
    modified: t.statusModifiedDecision,
  };
}

export function getDocTypeLabels(): Record<string, string> {
  const t = getLegalT();
  return {
    contract: t.docTypeContract,
    legislation: t.docTypeLegislation,
    court_decision: t.docTypeCourtDecision,
    internal: t.docTypeInternal,
    other: t.docTypeOther,
  };
}

export function getSectionTypeLabels(): Record<string, string> {
  const t = getLegalT();
  return {
    HEADER: t.sectionHeader,
    FACTS: t.sectionFacts,
    COURT_REASONING: t.sectionCourtReasoning,
    DECISION: t.sectionDecision,
    DISSENT: t.sectionDissent,
    AMOUNTS: t.sectionAmounts,
    CLAIMS: t.sectionClaims,
    LAW_REFERENCES: t.sectionLawReferences,
  };
}

/** @deprecated Use getStatusLabels() for i18n support */
export const STATUS_LABELS: Record<string, string> = {
  active: 'Чинне',
  overturned: 'Скасовано',
  modified: 'Змінено',
};

/** @deprecated Use getDocTypeLabels() for i18n support */
export const DOC_TYPE_LABELS: Record<string, string> = {
  contract: 'Договір',
  legislation: 'Законодавство',
  court_decision: 'Судове рішення',
  internal: 'Внутрішній',
  other: 'Інше',
};

/** @deprecated Use getSectionTypeLabels() for i18n support */
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
