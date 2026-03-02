import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../domain/decisions_notifier.dart';
import '../data/models/decision.dart';
import '../../../shared/widgets/loading_indicator.dart';
import '../../../shared/widgets/error_state.dart';

final decisionDetailProvider =
    FutureProvider.family<CourtDecision, String>((ref, docId) async {
  final repo = ref.read(decisionsRepositoryProvider);
  return repo.getDecision(docId);
});

class DecisionDetailScreen extends ConsumerWidget {
  final String decisionId;

  const DecisionDetailScreen({super.key, required this.decisionId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final detailAsync = ref.watch(decisionDetailProvider(decisionId));
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Рішення')),
      body: detailAsync.when(
        loading: () => const LoadingIndicator(message: 'Завантаження...'),
        error: (err, _) => ErrorState(
          message: err.toString(),
          onRetry: () => ref.invalidate(decisionDetailProvider(decisionId)),
        ),
        data: (decision) => SingleChildScrollView(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Metadata card
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        decision.number.isNotEmpty
                            ? decision.number
                            : 'Без номера',
                        style: theme.textTheme.headlineSmall,
                      ),
                      const SizedBox(height: 8),
                      _MetaRow(
                          icon: Icons.account_balance,
                          label: decision.court),
                      if (decision.date.isNotEmpty)
                        _MetaRow(
                            icon: Icons.calendar_today,
                            label: decision.date),
                      if (decision.type.isNotEmpty)
                        _MetaRow(
                            icon: Icons.description,
                            label: decision.type),
                      if (decision.judge != null)
                        _MetaRow(
                            icon: Icons.person,
                            label: decision.judge!),
                      if (decision.instance != null)
                        _MetaRow(
                            icon: Icons.layers,
                            label: decision.instance!),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),

              // Summary
              if (decision.summary.isNotEmpty) ...[
                Text('Резюме', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                Text(decision.summary, style: theme.textTheme.bodyMedium),
                const SizedBox(height: 16),
              ],

              // Full text
              if (decision.fullText != null &&
                  decision.fullText!.isNotEmpty) ...[
                Text('Повний текст', style: theme.textTheme.titleMedium),
                const SizedBox(height: 8),
                MarkdownBody(
                  data: decision.fullText!,
                  selectable: true,
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  final IconData icon;
  final String label;

  const _MetaRow({required this.icon, required this.label});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        children: [
          Icon(icon, size: 16, color: Theme.of(context).colorScheme.primary),
          const SizedBox(width: 8),
          Expanded(child: Text(label)),
        ],
      ),
    );
  }
}
