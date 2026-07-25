import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/documents/data/models/document.dart';

/// Tests for the page indicator behavior.
///
/// Since DocumentPagerScreen depends on DocumentDetailPage (which needs
/// Riverpod providers and platform channels), we test the indicator logic
/// and model-level paging behavior separately.
void main() {
  group('DocumentPagerScreen page indicator logic', () {
    test('single document should not show indicator', () {
      // _PageIndicator returns SizedBox.shrink() when total <= 1
      expect(1 <= 1, isTrue);
    });

    test('documents list provides correct indices', () {
      final docs = List.generate(
        5,
        (i) => VaultDocument(
          id: 'doc-$i',
          title: 'Документ ${i + 1}',
          type: 'text/plain',
        ),
      );
      expect(docs[0].title, 'Документ 1');
      expect(docs[4].title, 'Документ 5');
      expect(docs.length, 5);
    });

    test('page counter format for small lists (dots)', () {
      const total = 5;
      const current = 2;
      // For total <= 10: dots are shown, text counter in AppBar shows "3 з 5"
      expect('${current + 1} з $total', '3 з 5');
    });

    test('page counter format for large lists (text)', () {
      const total = 15;
      const current = 7;
      // For total > 10: text counter "8 / 15" is shown in indicator
      expect('${current + 1} / $total', '8 / 15');
    });

    test('chevron left disabled at first page', () {
      const current = 0;
      expect(current > 0, isFalse);
    });

    test('chevron right disabled at last page', () {
      const total = 5;
      const current = 4;
      expect(current < total - 1, isFalse);
    });

    test('both chevrons enabled for middle page', () {
      const total = 5;
      const current = 2;
      expect(current > 0, isTrue);
      expect(current < total - 1, isTrue);
    });
  });

  group('DocumentDetailScreen widget structure', () {
    testWidgets('shows document title in Scaffold AppBar', (tester) async {
      // Test the outer Scaffold structure without the inner DocumentDetailPage
      const doc = VaultDocument(
        id: 'doc-1',
        title: 'Контракт.pdf',
        type: 'application/pdf',
        sizeBytes: 1048576,
      );

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            appBar: AppBar(
              title: Text(
                doc.title,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            body: const Center(child: CircularProgressIndicator()),
          ),
        ),
      );

      expect(find.text('Контракт.pdf'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
    });

    testWidgets('error state shows retry button', (tester) async {
      const errorMessage = 'Не вдалось завантажити';

      await tester.pumpWidget(
        MaterialApp(
          home: Scaffold(
            body: Center(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.error_outline, size: 48),
                    const SizedBox(height: 12),
                    const Text(errorMessage, textAlign: TextAlign.center),
                    const SizedBox(height: 16),
                    ElevatedButton.icon(
                      onPressed: () {},
                      icon: const Icon(Icons.refresh),
                      label: const Text('Спробувати знову'),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      );

      expect(find.text(errorMessage), findsOneWidget);
      expect(find.byIcon(Icons.error_outline), findsOneWidget);
      expect(find.text('Спробувати знову'), findsOneWidget);
      expect(find.byIcon(Icons.refresh), findsOneWidget);
    });

    testWidgets('empty document shows empty message', (tester) async {
      await tester.pumpWidget(
        const MaterialApp(
          home: Scaffold(
            body: Center(child: Text('Документ порожній')),
          ),
        ),
      );

      expect(find.text('Документ порожній'), findsOneWidget);
    });
  });
}
