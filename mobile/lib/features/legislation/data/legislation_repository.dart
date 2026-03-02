import '../../../core/network/api_client.dart';
import 'models/legislation.dart';

class LegislationRepository {
  final ApiClient _api;

  LegislationRepository({required ApiClient api}) : _api = api;

  Future<List<LegislationCode>> getCodes() async {
    final response = await _api.get('/api/legislation');
    final data = response.data;
    List list;
    if (data is List) {
      list = data;
    } else if (data is Map && data.containsKey('codes')) {
      list = data['codes'] as List;
    } else {
      list = [];
    }
    return list
        .map((e) => LegislationCode.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<List<LegislationSection>> getStructure(String legislationId) async {
    final response =
        await _api.get('/api/legislation/$legislationId/structure');
    final data = response.data;
    List list;
    if (data is List) {
      list = data;
    } else if (data is Map && data.containsKey('sections')) {
      list = data['sections'] as List;
    } else if (data is Map && data.containsKey('structure')) {
      list = data['structure'] as List;
    } else {
      list = [];
    }
    return list
        .map((e) => LegislationSection.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<LegislationArticle> getArticle(
      String legislationId, String articleNumber) async {
    final response =
        await _api.get('/api/legislation/$legislationId/article/$articleNumber');
    return LegislationArticle.fromJson(
        response.data as Map<String, dynamic>);
  }
}
