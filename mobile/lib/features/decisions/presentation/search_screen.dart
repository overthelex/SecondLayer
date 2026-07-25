import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../domain/decisions_notifier.dart';
import '../data/models/decision.dart';
import '../../../navigation/route_names.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_indicator.dart';
import '../../../shared/widgets/error_state.dart';

class DecisionsSearchScreen extends ConsumerStatefulWidget {
  const DecisionsSearchScreen({super.key});

  @override
  ConsumerState<DecisionsSearchScreen> createState() =>
      _DecisionsSearchScreenState();
}

class _DecisionsSearchScreenState
    extends ConsumerState<DecisionsSearchScreen> {
  final _searchController = TextEditingController();
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    _scrollController.addListener(_onScroll);
  }

  @override
  void dispose() {
    _searchController.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _onScroll() {
    if (_scrollController.position.pixels >=
        _scrollController.position.maxScrollExtent - 200) {
      ref.read(decisionsNotifierProvider.notifier).loadMore();
    }
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(decisionsNotifierProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Судові рішення'),
        actions: [
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () => _showFilters(context),
          ),
        ],
      ),
      body: Column(
        children: [
          // Search bar
          Padding(
            padding: const EdgeInsets.all(12),
            child: TextField(
              controller: _searchController,
              decoration: InputDecoration(
                hintText: 'Пошук судових рішень...',
                prefixIcon: const Icon(Icons.search),
                suffixIcon: _searchController.text.isNotEmpty
                    ? IconButton(
                        icon: const Icon(Icons.clear),
                        onPressed: () {
                          _searchController.clear();
                          ref
                              .read(decisionsNotifierProvider.notifier)
                              .setQuery('');
                        },
                      )
                    : null,
              ),
              onChanged: (v) {
                ref.read(decisionsNotifierProvider.notifier).setQuery(v);
                setState(() {}); // Update clear button
              },
            ),
          ),

          // Active filters
          if (state.filters.procedureCode != null ||
              state.filters.courtLevel != null)
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Wrap(
                spacing: 8,
                children: [
                  if (state.filters.procedureCode != null)
                    Chip(
                      label: Text(state.filters.procedureCode!),
                      onDeleted: () => ref
                          .read(decisionsNotifierProvider.notifier)
                          .setFilters(state.filters
                              .copyWith(clearProcedure: true)),
                    ),
                  if (state.filters.courtLevel != null)
                    Chip(
                      label: Text(_courtLevelLabel(
                          state.filters.courtLevel!)),
                      onDeleted: () => ref
                          .read(decisionsNotifierProvider.notifier)
                          .setFilters(
                              state.filters.copyWith(clearLevel: true)),
                    ),
                ],
              ),
            ),

          // Results
          Expanded(
            child: state.isLoading
                ? const LoadingIndicator(message: 'Пошук...')
                : state.error != null
                    ? ErrorState(
                        message: state.error!,
                        onRetry: () => ref
                            .read(decisionsNotifierProvider.notifier)
                            .search(),
                      )
                    : state.results.isEmpty
                        ? EmptyState(
                            icon: Icons.gavel,
                            title: state.query.isEmpty
                                ? 'Введіть пошуковий запит'
                                : 'Нічого не знайдено',
                            subtitle: state.query.isEmpty
                                ? 'Наприклад: "стягнення аліментів"'
                                : null,
                          )
                        : ListView.separated(
                            controller: _scrollController,
                            padding:
                                const EdgeInsets.symmetric(horizontal: 12),
                            itemCount: state.results.length +
                                (state.isLoadingMore ? 1 : 0),
                            separatorBuilder: (_, __) =>
                                const Divider(height: 1),
                            itemBuilder: (_, index) {
                              if (index == state.results.length) {
                                return const Padding(
                                  padding: EdgeInsets.all(16),
                                  child: Center(
                                      child: CircularProgressIndicator()),
                                );
                              }
                              final decision = state.results[index];
                              return _DecisionTile(
                                decision: decision,
                                onTap: () => context.pushNamed(
                                  RouteNames.decisionDetail,
                                  pathParameters: {'id': decision.docId},
                                ),
                              );
                            },
                          ),
          ),
        ],
      ),
    );
  }

  void _showFilters(BuildContext context) {
    final notifier = ref.read(decisionsNotifierProvider.notifier);
    final currentFilters = ref.read(decisionsNotifierProvider).filters;

    showModalBottomSheet(
      context: context,
      builder: (ctx) => _FiltersSheet(
        filters: currentFilters,
        onApply: (filters) {
          notifier.setFilters(filters);
          Navigator.pop(ctx);
        },
        onReset: () {
          notifier.resetFilters();
          Navigator.pop(ctx);
        },
      ),
    );
  }

  String _courtLevelLabel(String level) => switch (level) {
        'supreme' => 'Верховний Суд',
        'appeal' => 'Апеляція',
        'first' => 'Перша інстанція',
        _ => level,
      };
}

class _DecisionTile extends StatelessWidget {
  final CourtDecision decision;
  final VoidCallback onTap;

  const _DecisionTile({required this.decision, required this.onTap});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return ListTile(
      contentPadding: const EdgeInsets.symmetric(vertical: 8),
      title: Text(
        decision.number.isNotEmpty ? decision.number : 'Без номера',
        style: theme.textTheme.titleSmall,
      ),
      subtitle: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const SizedBox(height: 4),
          Text(
            decision.court,
            style: theme.textTheme.bodySmall?.copyWith(
              color: theme.colorScheme.primary,
            ),
          ),
          if (decision.date.isNotEmpty) Text(decision.date, style: theme.textTheme.bodySmall),
          const SizedBox(height: 4),
          Text(
            decision.summary,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodySmall,
          ),
        ],
      ),
      trailing: decision.relevance > 0
          ? Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
              decoration: BoxDecoration(
                color: theme.colorScheme.primaryContainer,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Text(
                '${(decision.relevance * 100).toInt()}%',
                style: theme.textTheme.labelSmall?.copyWith(
                  color: theme.colorScheme.onPrimaryContainer,
                ),
              ),
            )
          : null,
      onTap: onTap,
    );
  }
}

class _FiltersSheet extends StatefulWidget {
  final DecisionSearchFilters filters;
  final void Function(DecisionSearchFilters) onApply;
  final VoidCallback onReset;

  const _FiltersSheet({
    required this.filters,
    required this.onApply,
    required this.onReset,
  });

  @override
  State<_FiltersSheet> createState() => _FiltersSheetState();
}

class _FiltersSheetState extends State<_FiltersSheet> {
  late String? _procedure;
  late String? _courtLevel;

  @override
  void initState() {
    super.initState();
    _procedure = widget.filters.procedureCode;
    _courtLevel = widget.filters.courtLevel;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text('Фільтри', style: theme.textTheme.headlineSmall),
          const SizedBox(height: 16),

          Text('Процесуальний кодекс', style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: ['ГПК', 'ЦПК', 'КАС', 'КПК'].map((code) {
              return ChoiceChip(
                label: Text(code),
                selected: _procedure == code,
                onSelected: (selected) {
                  setState(() => _procedure = selected ? code : null);
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 16),

          Text('Рівень суду', style: theme.textTheme.labelLarge),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            children: [
              ('supreme', 'ВС'),
              ('appeal', 'Апеляція'),
              ('first', '1 інст.'),
            ].map((entry) {
              return ChoiceChip(
                label: Text(entry.$2),
                selected: _courtLevel == entry.$1,
                onSelected: (selected) {
                  setState(
                      () => _courtLevel = selected ? entry.$1 : null);
                },
              );
            }).toList(),
          ),
          const SizedBox(height: 24),

          Row(
            children: [
              Expanded(
                child: OutlinedButton(
                  onPressed: widget.onReset,
                  child: const Text('Скинути'),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: ElevatedButton(
                  onPressed: () => widget.onApply(DecisionSearchFilters(
                    procedureCode: _procedure,
                    courtLevel: _courtLevel,
                  )),
                  child: const Text('Застосувати'),
                ),
              ),
            ],
          ),
          SizedBox(height: MediaQuery.of(context).padding.bottom),
        ],
      ),
    );
  }
}
