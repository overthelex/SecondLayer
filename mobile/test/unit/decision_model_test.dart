import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/decisions/data/models/decision.dart';

void main() {
  group('CourtDecision', () {
    test('creates from JSON with standard fields', () {
      final d = CourtDecision.fromJson({
        'id': '1',
        'doc_id': 'doc-123',
        'number': '910/1234/24',
        'court': 'Верховний Суд',
        'date': '2025-01-15',
        'type': 'Постанова',
        'summary': 'Test summary',
        'relevance': 0.85,
      });
      expect(d.docId, 'doc-123');
      expect(d.number, '910/1234/24');
      expect(d.court, 'Верховний Суд');
      expect(d.relevance, 0.85);
    });

    test('handles alternative field names', () {
      final d = CourtDecision.fromJson({
        'id': '2',
        'docId': 'doc-456',
        'case_number': '910/5678/24',
        'court_name': 'Апеляційний суд',
        'decision_date': '2025-02-20',
        'document_type': 'Ухвала',
        'snippet': 'Snippet text',
        'score': 0.72,
      });
      expect(d.docId, 'doc-456');
      expect(d.number, '910/5678/24');
      expect(d.court, 'Апеляційний суд');
      expect(d.summary, 'Snippet text');
      expect(d.relevance, 0.72);
    });
  });

  group('DecisionSearchFilters', () {
    test('copyWith clears fields', () {
      const filters = DecisionSearchFilters(
        procedureCode: 'ЦПК',
        courtLevel: 'supreme',
      );
      final cleared = filters.copyWith(clearProcedure: true);
      expect(cleared.procedureCode, isNull);
      expect(cleared.courtLevel, 'supreme');
    });

    test('toParams includes all set fields', () {
      const filters = DecisionSearchFilters(
        procedureCode: 'ГПК',
        courtLevel: 'appeal',
        dateFrom: '2025-01-01',
        dateTo: '2025-12-31',
      );
      final params = filters.toParams();
      expect(params.length, 4);
      expect(params['procedure_code'], 'ГПК');
      expect(params['court_level'], 'appeal');
    });
  });
}
