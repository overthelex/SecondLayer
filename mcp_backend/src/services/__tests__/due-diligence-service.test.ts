/**
 * Tests for DueDiligenceService — risk scoring, report generation,
 * and bulk review orchestration.
 */

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('dd-uuid') }));

import { DueDiligenceService, DDFinding, DocumentRiskScore } from '../due-diligence-service';

const createMockSectionizer = () => ({
  sectionize: jest.fn().mockResolvedValue({ sections: [] }),
});

const createMockPatternStore = () => ({
  findSimilarPatterns: jest.fn().mockResolvedValue([]),
  storePattern: jest.fn().mockResolvedValue(undefined),
});

const createMockCitationValidator = () => ({
  validate: jest.fn().mockResolvedValue({ valid: true }),
});

const createMockDocumentService = () => ({
  getDocument: jest.fn().mockResolvedValue({
    id: 'doc-1',
    title: 'Test Contract',
    content: 'This is a test document with legal text.',
    mimeType: 'text/plain',
  }),
  getDocumentContent: jest.fn().mockResolvedValue('This is a test document with legal text.'),
});

const createMockLlm = () => ({
  chat: jest.fn().mockResolvedValue({
    content: JSON.stringify({
      findings: [{
        category: 'contractual_obligation',
        riskLevel: 'medium',
        title: 'Missing termination clause',
        description: 'No termination provisions found',
        recommendation: 'Add termination clause',
      }],
    }),
  }),
});

const makeFinding = (overrides: Partial<DDFinding> = {}): DDFinding => ({
  id: 'f1',
  documentId: 'doc-1',
  documentTitle: 'Test Doc',
  category: 'legal_risk',
  riskLevel: 'medium',
  title: 'Issue',
  description: 'Description',
  confidence: 0.8,
  ...overrides,
});

describe('DueDiligenceService', () => {
  let service: DueDiligenceService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new DueDiligenceService(
      createMockSectionizer() as any,
      createMockPatternStore() as any,
      createMockCitationValidator() as any,
      createMockDocumentService() as any,
      createMockLlm() as any
    );
  });

  describe('calculateRiskScore', () => {
    it('should return low risk for no findings', () => {
      const result = service.calculateRiskScore('doc-1', [], 'Test');

      expect(result.overallRisk).toBe('low');
      expect(result.score).toBeLessThanOrEqual(25);
    });

    it('should return high risk for critical findings', () => {
      const findings: DDFinding[] = [
        makeFinding({ id: 'f1', riskLevel: 'critical', category: 'legal_risk' }),
        makeFinding({ id: 'f2', riskLevel: 'high', category: 'financial_risk' }),
      ];

      const result = service.calculateRiskScore('doc-1', findings, 'Test');

      expect(result.score).toBeGreaterThan(0);
      expect(['medium', 'high', 'critical']).toContain(result.overallRisk);
      expect(result.criticalFindingsCount).toBe(1);
      expect(result.highFindingsCount).toBe(1);
    });

    it('should return medium risk for medium findings', () => {
      const findings: DDFinding[] = [
        makeFinding({ category: 'compliance_issue', riskLevel: 'medium' }),
      ];

      const result = service.calculateRiskScore('doc-1', findings, 'Test');
      expect(result.mediumFindingsCount).toBe(1);
    });
  });

  describe('generateReport', () => {
    it('should generate DD report with executive summary', async () => {
      const findings: DDFinding[] = [makeFinding()];
      const riskScores: DocumentRiskScore[] = [{
        documentId: 'doc-1',
        documentTitle: 'Test',
        overallRisk: 'medium',
        score: 45,
        breakdown: { legal: 45, financial: 0, compliance: 0, operational: 0, contractual: 0 },
        criticalFindingsCount: 0,
        highFindingsCount: 0,
        mediumFindingsCount: 1,
        lowFindingsCount: 0,
      }];

      const result = await service.generateReport(findings, riskScores, 'DD Report');

      expect(result.title).toBe('DD Report');
      expect(result.findings).toHaveLength(1);
      expect(result.riskScores).toHaveLength(1);
      expect(result.id).toBeDefined();
      expect(result.processingTimeMs).toBeGreaterThanOrEqual(0);
    });

    it('should generate report with empty findings', async () => {
      const result = await service.generateReport([], [], 'Empty Report');

      expect(result.findings).toHaveLength(0);
      expect(result.riskScores).toHaveLength(0);
    });
  });

  describe('runBulkReview', () => {
    it('should process documents and return findings', async () => {
      const result = await service.runBulkReview(['doc-1']);

      expect(result.findings).toBeDefined();
      expect(result.riskScores).toBeDefined();
    });

    it('should call progress callback', async () => {
      const onProgress = jest.fn();

      await service.runBulkReview(['doc-1'], { onProgress });

      expect(onProgress).toHaveBeenCalled();
    });

    it('should handle empty document list', async () => {
      const result = await service.runBulkReview([]);

      expect(result.findings).toHaveLength(0);
      expect(result.riskScores).toHaveLength(0);
    });
  });
});
