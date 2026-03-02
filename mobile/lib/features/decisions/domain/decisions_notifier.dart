import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/di/service_locator.dart';
import '../data/decisions_repository.dart';
import '../data/models/decision.dart';
import 'decisions_state.dart';

final decisionsRepositoryProvider = Provider<DecisionsRepository>((ref) {
  return DecisionsRepository(api: sl.apiClient);
});

final decisionsNotifierProvider =
    NotifierProvider<DecisionsNotifier, DecisionsState>(DecisionsNotifier.new);

class DecisionsNotifier extends Notifier<DecisionsState> {
  late final DecisionsRepository _repo;
  Timer? _debounce;

  @override
  DecisionsState build() {
    _repo = ref.read(decisionsRepositoryProvider);
    ref.onDispose(() => _debounce?.cancel());
    return const DecisionsState();
  }

  void setQuery(String query) {
    state = state.copyWith(query: query);
    _debounce?.cancel();
    _debounce = Timer(const Duration(milliseconds: 500), () {
      if (query.trim().length >= 3) {
        search();
      }
    });
  }

  Future<void> search() async {
    if (state.query.trim().length < 3) return;
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final results = await _repo.search(
        query: state.query.trim(),
        filters: state.filters,
      );
      state = state.copyWith(
        results: results,
        isLoading: false,
        hasMore: results.length >= 20,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> loadMore() async {
    if (state.isLoadingMore || !state.hasMore) return;
    state = state.copyWith(isLoadingMore: true);
    try {
      final results = await _repo.search(
        query: state.query.trim(),
        filters: state.filters,
        offset: state.results.length,
      );
      state = state.copyWith(
        results: [...state.results, ...results],
        isLoadingMore: false,
        hasMore: results.length >= 20,
      );
    } catch (e) {
      state = state.copyWith(isLoadingMore: false, error: e.toString());
    }
  }

  void setFilters(DecisionSearchFilters filters) {
    state = state.copyWith(filters: filters);
    if (state.query.isNotEmpty) search();
  }

  void resetFilters() {
    state = state.copyWith(filters: const DecisionSearchFilters());
    if (state.query.isNotEmpty) search();
  }
}
