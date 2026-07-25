import { DeadlineReportRenderer } from '../deadline-report-renderer';
import type { PackagedLawyerAnswer } from '../../types/index';

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeMinimalAnswer(): PackagedLawyerAnswer {
  return {
    short_conclusion: {
      conclusion: 'Строк становить 30 днів.',
      conditions: undefined,
      risk_or_exception: undefined,
    },
    legal_framework: { norms: [] },
    supreme_court_positions: [],
    practice: [],
    criteria_test: [],
    counterarguments_and_risks: [],
    checklist: { steps: [], evidence: [] },
    sources: [],
  };
}

function makeFullAnswer(): PackagedLawyerAnswer {
  return {
    short_conclusion: {
      conclusion: 'Строк становить 30 днів.',
      conditions: 'За умови подання заяви.',
      risk_or_exception: 'Ризик пропуску строку.',
    },
    legal_framework: {
      norms: [
        { act: 'ЦПК України', article_ref: 'ст. 256', quote: 'Строк подання апеляції.', comment: 'Коментар.' },
      ],
    },
    supreme_court_positions: [
      {
        thesis: 'Строк обчислюється з дня вручення рішення.',
        context: 'ВС, постанова від 01.01.2023',
        quotes: [
          { quote: 'Цитата ВС.', source_doc_id: 'doc123', section_type: 'reasoning' as any },
        ],
      },
    ],
    practice: [
      {
        source_doc_id: 'doc456',
        section_type: 'vyrishyv' as any,
        quote: 'Задовольнити апеляційну скаргу.',
        relevance_reason: 'Аналогічна справа.',
        case_number: '12-3456/2024',
      },
    ],
    criteria_test: ['Поважність причини: пропуск з незалежних причин.'],
    counterarguments_and_risks: [
      'Контраргумент: суд може відмовити.',
      'Ризик повернення: без додатків.',
    ],
    checklist: {
      steps: ['Подати заяву – протягом 30 днів після вручення.'],
      evidence: ['Копія рішення суду першої інстанції.'],
    },
    sources: [],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('DeadlineReportRenderer', () => {
  let renderer: DeadlineReportRenderer;

  beforeEach(() => {
    renderer = new DeadlineReportRenderer();
  });

  describe('renderDeadlineReport — structure', () => {
    it('should return a valid HTML document', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'Питання про строк', 'ЦПК');
      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<html lang="uk">');
      expect(html).toContain('</html>');
    });

    it('should embed queryText and procedureCode in the output', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'Строк апеляції', 'ЦПК');
      expect(html).toContain('Строк апеляції');
      expect(html).toContain('ЦПК');
    });

    it('should render page title', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).toContain('Розрахунок процесуальних строків');
    });

    it('should include deadline calculation box', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).toContain('Розрахунок строків');
      expect(html).toContain('Строк: 30 днів');
    });

    it('should include warning disclaimer', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).toContain('Строки та правила їх обчислення');
    });

    it('should include footer attribution', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).toContain('SecondLayer MCP Backend');
    });
  });

  describe('renderDeadlineReport — conclusion section', () => {
    it('should render short_conclusion text', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).toContain('Строк становить 30 днів.');
    });

    it('should render conditions when provided', () => {
      const answer = makeFullAnswer();
      const html = renderer.renderDeadlineReport(answer, 'q', 'code');
      expect(html).toContain('За умови подання заяви.');
    });

    it('should render risk_or_exception when provided', () => {
      const answer = makeFullAnswer();
      const html = renderer.renderDeadlineReport(answer, 'q', 'code');
      expect(html).toContain('Ризик пропуску строку.');
    });

    it('should skip conditions block when not provided', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).not.toContain('<strong>Умови:</strong>');
    });
  });

  describe('renderDeadlineReport — legal framework section', () => {
    it('should render norms when provided', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Правова основа');
      expect(html).toContain('ЦПК України');
      expect(html).toContain('ст. 256');
    });

    it('should render norm quote when present', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Строк подання апеляції.');
    });

    it('should render norm comment when present', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Коментар.');
    });

    it('should skip legal framework section when norms array is empty', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).not.toContain('Правова основа');
    });
  });

  describe('renderDeadlineReport — Supreme Court positions', () => {
    it('should render thesis from supreme court positions', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Позиції Верховного Суду');
      expect(html).toContain('Строк обчислюється з дня вручення рішення.');
    });

    it('should render quote and link to decision', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Цитата ВС.');
      expect(html).toContain('doc123');
    });

    it('should skip section when positions array is empty', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).not.toContain('Позиції Верховного Суду');
    });
  });

  describe('renderDeadlineReport — criteria', () => {
    it('should render criteria_test items', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Критерії поновлення пропущеного строку');
      expect(html).toContain('Поважність причини');
    });

    it('should skip when criteria_test is empty', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).not.toContain('Критерії поновлення пропущеного строку');
    });
  });

  describe('renderDeadlineReport — risks', () => {
    it('should render counterarguments section', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Контраргументи та процесуальні ризики');
      expect(html).toContain('Контраргументи');
    });

    it('should render risks section', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Процесуальні ризики');
    });

    it('should skip section when counterarguments_and_risks is empty', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).not.toContain('Контраргументи та процесуальні ризики');
    });
  });

  describe('renderDeadlineReport — checklist', () => {
    it('should render checklist steps', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Чеклист дій');
      expect(html).toContain('Подати заяву');
    });

    it('should render evidence list', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Необхідні докази');
      expect(html).toContain('Копія рішення суду');
    });
  });

  describe('renderDeadlineReport — practice', () => {
    it('should render relevant practice cases', () => {
      const html = renderer.renderDeadlineReport(makeFullAnswer(), 'q', 'code');
      expect(html).toContain('Релевантна практика');
      expect(html).toContain('12-3456/2024');
    });

    it('should skip section when practice is empty', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      expect(html).not.toContain('Релевантна практика');
    });

    it('should show overflow count when more than 20 cases', () => {
      const answer = makeMinimalAnswer();
      answer.practice = Array.from({ length: 25 }, (_, i) => ({
        source_doc_id: `doc${i}`,
        section_type: 'reasoning' as any,
        quote: `Цитата ${i}`,
        case_number: `case-${i}`,
      }));
      const html = renderer.renderDeadlineReport(answer, 'q', 'code');
      expect(html).toContain('+ 5 додаткових справ знайдено');
    });
  });

  describe('HTML escaping (XSS prevention)', () => {
    it('should escape HTML special characters in queryText', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), '<script>alert("xss")</script>', 'ЦПК');
      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;');
    });

    it('should escape HTML in conclusion text', () => {
      const answer = makeMinimalAnswer();
      answer.short_conclusion.conclusion = '<b>Injection</b>';
      const html = renderer.renderDeadlineReport(answer, 'q', 'code');
      expect(html).not.toContain('<b>Injection</b>');
      expect(html).toContain('&lt;b&gt;Injection&lt;/b&gt;');
    });
  });

  describe('theme variants', () => {
    it('should apply dark theme styles when theme=dark', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code', { theme: 'dark' });
      expect(html).toContain('#e0e0e0'); // dark text color
      expect(html).toContain('#1a1a1a'); // dark background
    });

    it('should default to light theme when theme is not specified', () => {
      const html = renderer.renderDeadlineReport(makeMinimalAnswer(), 'q', 'code');
      // Light theme uses #1a1a1a for text and #f5f5f5 for background
      expect(html).toContain('#f5f5f5');
    });
  });

  describe('includeFullLegislation option', () => {
    it('should render full legislation text when option is set and article_number matches', () => {
      const answer = makeFullAnswer();
      const html = renderer.renderDeadlineReport(answer, 'q', 'code', {
        includeFullLegislation: true,
        legislationReferences: [
          {
            code: 'ЦПК',
            rada_id: 'cpc',
            article_number: '256',
            title: 'Строк апеляційного оскарження',
            full_text: 'Апеляційна скарга може бути подана протягом тридцяти днів.',
            url: 'https://zakon.rada.gov.ua/laws/show/1618-15#n256',
          },
        ],
      });
      expect(html).toContain('Повний текст статті 256 ЦПК');
      expect(html).toContain('Апеляційна скарга може бути подана протягом тридцяти днів.');
    });

    it('should not render full text when no matching reference found', () => {
      const answer = makeFullAnswer();
      const html = renderer.renderDeadlineReport(answer, 'q', 'code', {
        includeFullLegislation: true,
        legislationReferences: [
          {
            code: 'ЦПК',
            rada_id: 'cpc',
            article_number: '999', // no match
            title: 'Інша стаття',
            full_text: 'Повний текст.',
            url: 'https://example.com',
          },
        ],
      });
      expect(html).not.toContain('Повний текст статті 999');
    });
  });
});
