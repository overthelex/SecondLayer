import '../data/models/decision.dart';

class DecisionsState {
  final String query;
  final List<CourtDecision> results;
  final bool isLoading;
  final bool isLoadingMore;
  final String? error;
  final DecisionSearchFilters filters;
  final bool hasMore;

  const DecisionsState({
    this.query = '',
    this.results = const [],
    this.isLoading = false,
    this.isLoadingMore = false,
    this.error,
    this.filters = const DecisionSearchFilters(),
    this.hasMore = true,
  });

  DecisionsState copyWith({
    String? query,
    List<CourtDecision>? results,
    bool? isLoading,
    bool? isLoadingMore,
    String? error,
    DecisionSearchFilters? filters,
    bool? hasMore,
    bool clearError = false,
  }) =>
      DecisionsState(
        query: query ?? this.query,
        results: results ?? this.results,
        isLoading: isLoading ?? this.isLoading,
        isLoadingMore: isLoadingMore ?? this.isLoadingMore,
        error: clearError ? null : (error ?? this.error),
        filters: filters ?? this.filters,
        hasMore: hasMore ?? this.hasMore,
      );
}
