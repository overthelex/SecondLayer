import '../../../core/network/api_client.dart';
import 'models/document.dart';

class DocumentRepository {
  final ApiClient _api;

  DocumentRepository({required ApiClient api}) : _api = api;

  Future<List<VaultDocument>> getDocuments({String? folderId}) async {
    final response = await _api.get('/api/vault/documents', queryParameters: {
      if (folderId != null) 'folderId': folderId,
    });
    final data = response.data;
    List list;
    if (data is List) {
      list = data;
    } else if (data is Map && data.containsKey('documents')) {
      list = data['documents'] as List;
    } else {
      list = [];
    }
    return list
        .map((e) => VaultDocument.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<DocumentFolder>> getFolders({String? parentId}) async {
    final response = await _api.get('/api/vault/folders', queryParameters: {
      if (parentId != null) 'parentId': parentId,
    });
    final data = response.data;
    List list;
    if (data is List) {
      list = data;
    } else if (data is Map && data.containsKey('folders')) {
      list = data['folders'] as List;
    } else {
      list = [];
    }
    return list
        .map((e) => DocumentFolder.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<void> deleteDocument(String id) async {
    await _api.delete('/api/vault/documents/$id');
  }
}
