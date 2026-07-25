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

  group('DocumentPreview', () {
    test('creates from JSON with preview_url key', () {
      final preview = DocumentPreview.fromJson({
        'preview_url': 'https://example.com/preview.pdf',
        'mime_type': 'application/pdf',
      });
      expect(preview.previewUrl, 'https://example.com/preview.pdf');
      expect(preview.mimeType, 'application/pdf');
    });

    test('uses camelCase fallback JSON keys', () {
      final preview = DocumentPreview.fromJson({
        'previewUrl': 'https://example.com/img.png',
        'mimeType': 'image/png',
      });
      expect(preview.previewUrl, 'https://example.com/img.png');
      expect(preview.mimeType, 'image/png');
    });

    test('isPdf returns true for PDF mime type', () {
      const preview = DocumentPreview(
        mimeType: 'application/pdf',
        previewUrl: 'https://example.com/file.pdf',
      );
      expect(preview.isPdf, true);
      expect(preview.isImage, false);
    });

    test('isPdf returns true for .pdf URL even without mime type', () {
      const preview = DocumentPreview(
        previewUrl: 'https://example.com/file.pdf',
      );
      expect(preview.isPdf, true);
    });

    test('isImage returns true for image mime types', () {
      for (final mime in ['image/png', 'image/jpeg', 'image/gif']) {
        final preview = DocumentPreview(mimeType: mime);
        expect(preview.isImage, true, reason: '$mime should be image');
        expect(preview.isPdf, false);
      }
    });

    test('isImage returns true for image URL extensions', () {
      const preview = DocumentPreview(
        previewUrl: 'https://example.com/photo.jpg',
      );
      expect(preview.isImage, true);
    });

    test('hasPreview returns false when url is null or empty', () {
      const noUrl = DocumentPreview(mimeType: 'text/plain');
      expect(noUrl.hasPreview, false);

      const emptyUrl = DocumentPreview(
        mimeType: 'text/plain',
        previewUrl: '',
      );
      expect(emptyUrl.hasPreview, false);
    });

    test('hasPreview returns true when url is present', () {
      const preview = DocumentPreview(
        mimeType: 'application/pdf',
        previewUrl: 'https://example.com/preview',
      );
      expect(preview.hasPreview, true);
    });

    test('default constructor has null fields', () {
      const preview = DocumentPreview();
      expect(preview.previewUrl, isNull);
      expect(preview.mimeType, isNull);
      expect(preview.hasPreview, false);
      expect(preview.isPdf, false);
      expect(preview.isImage, false);
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
