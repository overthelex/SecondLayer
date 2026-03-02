import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/di/service_locator.dart';
import '../data/legislation_repository.dart';
import '../data/models/legislation.dart';

final legislationRepositoryProvider = Provider<LegislationRepository>((ref) {
  return LegislationRepository(api: sl.apiClient);
});

final codesProvider = FutureProvider<List<LegislationCode>>((ref) async {
  final repo = ref.read(legislationRepositoryProvider);
  return repo.getCodes();
});

final structureProvider =
    FutureProvider.family<List<LegislationSection>, String>(
        (ref, legislationId) async {
  final repo = ref.read(legislationRepositoryProvider);
  return repo.getStructure(legislationId);
});

final articleProvider = FutureProvider.family<LegislationArticle,
    ({String legislationId, String articleNumber})>((ref, params) async {
  final repo = ref.read(legislationRepositoryProvider);
  return repo.getArticle(params.legislationId, params.articleNumber);
});
