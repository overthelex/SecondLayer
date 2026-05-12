import { PHASE1_CONTENT } from './content-phase1';
import { PHASE2_CONTENT } from './content-phase2';
import { PHASE3_CONTENT } from './content-phase3';
import { PHASE4_CONTENT } from './content-phase4';

export interface WeekContent {
  lectureEn: string;
  practiceEn: string[];
}

const ALL_CONTENT: Record<number, WeekContent> = {
  ...PHASE1_CONTENT,
  ...PHASE2_CONTENT,
  ...PHASE3_CONTENT,
  ...PHASE4_CONTENT,
};

export function getWeekContent(week: number): WeekContent | null {
  return ALL_CONTENT[week] || null;
}
