import '../../../core/network/api_client.dart';
import 'models/decision.dart';

class DecisionsRepository {
  final ApiClient _api;

  DecisionsRepository({required ApiClient api}) : _api = api;

  Future<List<CourtDecision>> search({
    required String query,
    DecisionSearchFilters? filters,
    int limit = 20,
    int offset = 0,
  }) async {
    final response = await _api.post('/api/tools/search_court_decisions', data: {
      'query': query,
      'limit': limit,
      'offset': offset,
      ...?filters?.toParams(),
    });

    final data = response.data;
    // Backend may return results in various shapes
    List results;
    if (data is Map && data.containsKey('results')) {
      results = data['results'] as List;
    } else if (data is Map && data.containsKey('decisions')) {
      results = data['decisions'] as List;
    } else if (data is List) {
      results = data;
    } else {
      results = [];
    }

    return results
        .map((e) => CourtDecision.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<CourtDecision> getDecision(String docId) async {
    final response = await _api.post('/api/tools/get_court_decision', data: {
      'doc_id': docId,
    });

    final data = response.data as Map<String, dynamic>;
    return CourtDecision.fromJson(data);
  }
}
