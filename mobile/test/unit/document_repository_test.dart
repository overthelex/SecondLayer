import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/documents/data/models/document.dart';

/// Tests for DocumentRepository logic using a fake API client.
///
/// Since DocumentRepository depends on ApiClient which has platform-dependent
/// dependencies (SecureStorage), we test the parsing logic by replicating the
/// repository methods with a simple fake.
class _FakeApiClient {
  dynamic Function(String path, {Map<String, dynamic>? queryParameters})?
      onGet;
  dynamic Function(String path)? onDelete;

  Future<Response> get(String path,
      {Map<String, dynamic>? queryParameters}) async {
    final data = onGet?.call(path, queryParameters: queryParameters);
    return Response(
      requestOptions: RequestOptions(path: path),
      data: data,
      statusCode: 200,
    );
  }

  Future<Response> delete(String path) async {
    onDelete?.call(path);
    return Response(
      requestOptions: RequestOptions(path: path),
      statusCode: 204,
    );
  }
}

/// Mirrors DocumentRepository logic for testing without platform dependencies.
class _TestableDocumentRepository {
  final _FakeApiClient _api;

  _TestableDocumentRepository(this._api);

  Future<List<VaultDocument>> getDocuments({String? folderId}) async {
    final response = await _api.get('/api/documents', queryParameters: {
      if (folderId != null) 'folderId': folderId,
    });
    final data = response.data;
    List list;
    if (data is List) {
      list = data;
    } else if (data is Map && data.containsKey('documents')) {
      list = data['documents'] as List;
    } else if (data is Map && data.containsKey('data')) {
      list = data['data'] as List;
    } else {
      list = [];
    }
    return list
        .whereType<Map<String, dynamic>>()
        .map((e) => VaultDocument.fromJson(e))
        .toList();
  }

  Future<DocumentPreview> getDocumentPreview(String documentId) async {
    final response = await _api.get('/api/documents/$documentId/preview');
    final data = response.data;
    if (data is Map<String, dynamic>) {
      return DocumentPreview.fromJson(data);
    }
    return const DocumentPreview();
  }

  Future<String> getDocumentText(String documentId) async {
    final response = await _api.get('/api/documents/$documentId/text');
    final data = response.data;
    if (data is Map<String, dynamic>) {
      return data['text'] as String? ?? data['content'] as String? ?? '';
    }
    if (data is String) {
      return data;
    }
    return '';
  }

  Future<void> deleteDocument(String id) async {
    await _api.delete('/api/documents/$id');
  }
}

void main() {
  group('DocumentRepository', () {
    late _FakeApiClient fakeApi;
    late _TestableDocumentRepository repo;

    setUp(() {
      fakeApi = _FakeApiClient();
      repo = _TestableDocumentRepository(fakeApi);
    });

    group('getDocuments', () {
      test('parses list response', () async {
        fakeApi.onGet = (path, {queryParameters}) => [
              {
                'id': 'doc-1',
                'title': 'File1.pdf',
                'type': 'application/pdf'
              },
              {
                'id': 'doc-2',
                'title': 'File2.docx',
                'type': 'application/docx'
              },
            ];

        final docs = await repo.getDocuments();
        expect(docs, hasLength(2));
        expect(docs[0].id, 'doc-1');
        expect(docs[1].title, 'File2.docx');
      });

      test('parses wrapped documents response', () async {
        fakeApi.onGet = (path, {queryParameters}) => {
              'documents': [
                {
                  'id': 'doc-1',
                  'title': 'Wrapped.pdf',
                  'type': 'application/pdf'
                },
              ],
            };

        final docs = await repo.getDocuments();
        expect(docs, hasLength(1));
        expect(docs[0].title, 'Wrapped.pdf');
      });

      test('parses wrapped data response', () async {
        fakeApi.onGet = (path, {queryParameters}) => {
              'data': [
                {
                  'id': 'doc-1',
                  'title': 'DataWrap.pdf',
                  'type': 'application/pdf'
                },
              ],
            };

        final docs = await repo.getDocuments();
        expect(docs, hasLength(1));
        expect(docs[0].title, 'DataWrap.pdf');
      });

      test('returns empty list for unexpected format', () async {
        fakeApi.onGet = (path, {queryParameters}) => {'unexpected': 'format'};

        final docs = await repo.getDocuments();
        expect(docs, isEmpty);
      });

      test('passes folderId as query parameter', () async {
        String? capturedPath;
        Map<String, dynamic>? capturedParams;
        fakeApi.onGet = (path, {queryParameters}) {
          capturedPath = path;
          capturedParams = queryParameters;
          return <Map<String, dynamic>>[];
        };

        await repo.getDocuments(folderId: 'folder-42');
        expect(capturedPath, '/api/documents');
        expect(capturedParams, containsPair('folderId', 'folder-42'));
      });
    });

    group('getDocumentPreview', () {
      test('returns DocumentPreview from JSON', () async {
        fakeApi.onGet = (path, {queryParameters}) => {
              'preview_url': 'https://cdn.example.com/preview.pdf',
              'mime_type': 'application/pdf',
            };

        final preview = await repo.getDocumentPreview('doc-1');
        expect(preview.previewUrl, 'https://cdn.example.com/preview.pdf');
        expect(preview.isPdf, true);
        expect(preview.hasPreview, true);
      });

      test('returns empty DocumentPreview for non-map response', () async {
        fakeApi.onGet = (path, {queryParameters}) => 'not a map';

        final preview = await repo.getDocumentPreview('doc-1');
        expect(preview.previewUrl, isNull);
        expect(preview.hasPreview, false);
      });

      test('calls correct endpoint', () async {
        String? capturedPath;
        fakeApi.onGet = (path, {queryParameters}) {
          capturedPath = path;
          return {'mime_type': 'image/png'};
        };

        await repo.getDocumentPreview('doc-99');
        expect(capturedPath, '/api/documents/doc-99/preview');
      });
    });

    group('getDocumentText', () {
      test('returns text from string response', () async {
        fakeApi.onGet = (path, {queryParameters}) => 'Текст документа';

        final text = await repo.getDocumentText('doc-1');
        expect(text, 'Текст документа');
      });

      test('extracts text from "text" key in map response', () async {
        fakeApi.onGet =
            (path, {queryParameters}) => {'text': 'Текст з обгорткою'};

        final text = await repo.getDocumentText('doc-1');
        expect(text, 'Текст з обгорткою');
      });

      test('extracts text from "content" key in map response', () async {
        fakeApi.onGet =
            (path, {queryParameters}) => {'content': 'Зміст документа'};

        final text = await repo.getDocumentText('doc-1');
        expect(text, 'Зміст документа');
      });

      test('returns empty string for null data', () async {
        fakeApi.onGet = (path, {queryParameters}) => null;

        final text = await repo.getDocumentText('doc-1');
        expect(text, '');
      });

      test('returns empty string for map without text/content keys', () async {
        fakeApi.onGet =
            (path, {queryParameters}) => {'other': 'data'};

        final text = await repo.getDocumentText('doc-1');
        expect(text, '');
      });
    });

    group('deleteDocument', () {
      test('calls correct endpoint', () async {
        String? deletedPath;
        fakeApi.onDelete = (path) => deletedPath = path;

        await repo.deleteDocument('doc-1');
        expect(deletedPath, '/api/documents/doc-1');
      });
    });
  });
}
