import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/documents/data/models/document.dart';

void main() {
  group('VaultDocument', () {
    test('creates from JSON', () {
      final doc = VaultDocument.fromJson({
        'id': 'doc-1',
        'title': 'Contract.pdf',
        'type': 'application/pdf',
        'size_bytes': 1048576,
        'uploaded_at': '2026-01-01T00:00:00Z',
      });
      expect(doc.title, 'Contract.pdf');
      expect(doc.sizeFormatted, '1.0 MB');
    });

    test('formats sizes correctly', () {
      expect(
        const VaultDocument(id: '1', title: 't', type: 't', sizeBytes: 500)
            .sizeFormatted,
        '500 B',
      );
      expect(
        const VaultDocument(id: '1', title: 't', type: 't', sizeBytes: 2048)
            .sizeFormatted,
        '2.0 KB',
      );
      expect(
        const VaultDocument(
                id: '1', title: 't', type: 't', sizeBytes: 5242880)
            .sizeFormatted,
        '5.0 MB',
      );
    });

    test('handles null size', () {
      const doc = VaultDocument(id: '1', title: 't', type: 't');
      expect(doc.sizeFormatted, '');
    });
  });

  group('UploadProgress', () {
    test('calculates progress', () {
      const p = UploadProgress(
        fileName: 'test.pdf',
        totalChunks: 10,
        uploadedChunks: 5,
        status: 'uploading',
      );
      expect(p.progress, 0.5);
    });

    test('handles zero chunks', () {
      const p = UploadProgress(
        fileName: 'test.pdf',
        totalChunks: 0,
      );
      expect(p.progress, 0);
    });
  });
}
