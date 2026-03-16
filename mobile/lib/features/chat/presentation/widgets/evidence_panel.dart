import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/chat_notifier.dart';
import '../../domain/chat_state.dart';
import '../../../../shared/theme/app_colors.dart';
import 'decision_card.dart';
import 'citation_card.dart';
import 'document_card.dart';

class EvidencePanel extends ConsumerWidget {
  final DraggableScrollableController controller;

  const EvidencePanel({super.key, required this.controller});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final evidence = ref.watch(
      chatNotifierProvider.select((s) => s.evidence),
    );
    final isOpen = ref.watch(
      chatNotifierProvider.select((s) => s.isEvidencePanelOpen),
    );

    if (!evidence.hasAny) return const SizedBox.shrink();

    return DraggableScrollableSheet(
      controller: controller,
      initialChildSize: isOpen ? 0.45 : 0.0,
      minChildSize: 0.0,
      maxChildSize: 0.9,
      snap: true,
      snapSizes: const [0.0, 0.45, 0.9],
      builder: (context, scrollController) {
        return Container(
          decoration: BoxDecoration(
            color: Theme.of(context).colorScheme.surface,
            borderRadius:
                const BorderRadius.vertical(top: Radius.circular(16)),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: 0.1),
                blurRadius: 10,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: _EvidencePanelContent(
            evidence: evidence,
            scrollController: scrollController,
          ),
        );
      },
    );
  }
}

class _EvidencePanelContent extends StatelessWidget {
  final EvidenceState evidence;
  final ScrollController scrollController;

  const _EvidencePanelContent({
    required this.evidence,
    required this.scrollController,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DefaultTabController(
      length: 3,
      child: Column(
        children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 8, bottom: 4),
              width: 32,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Tab bar
          TabBar(
            labelColor: theme.colorScheme.primary,
            unselectedLabelColor: theme.colorScheme.onSurfaceVariant,
            indicatorColor: theme.colorScheme.primary,
            tabs: [
              Tab(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Рішення'),
                    if (evidence.decisions.isNotEmpty) ...[
                      const SizedBox(width: 4),
                      _CountBadge(count: evidence.decisions.length),
                    ],
                  ],
                ),
              ),
              Tab(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Норми'),
                    if (evidence.citations.isNotEmpty) ...[
                      const SizedBox(width: 4),
                      _CountBadge(count: evidence.citations.length),
                    ],
                  ],
                ),
              ),
              Tab(
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Text('Документи'),
                    if (evidence.vaultDocuments.isNotEmpty) ...[
                      const SizedBox(width: 4),
                      _CountBadge(count: evidence.vaultDocuments.length),
                    ],
                  ],
                ),
              ),
            ],
          ),

          // Tab content
          Expanded(
            child: TabBarView(
              children: [
                // Decisions tab
                _buildDecisionsList(context),
                // Citations tab
                _buildCitationsList(context),
                // Documents tab
                _buildDocumentsList(context),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildDecisionsList(BuildContext context) {
    final allDecisions = [
      ...evidence.decisions,
      ...evidence.otherCourtDocs,
    ];

    if (allDecisions.isEmpty) {
      return const Center(
        child: Text('Рішень не знайдено', style: TextStyle(color: AppColors.textSecondary)),
      );
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(12),
      itemCount: allDecisions.length,
      itemBuilder: (_, index) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: DecisionCard(decision: allDecisions[index]),
      ),
    );
  }

  Widget _buildCitationsList(BuildContext context) {
    if (evidence.citations.isEmpty) {
      return const Center(
        child: Text('Нормативних посилань не знайдено',
            style: TextStyle(color: AppColors.textSecondary)),
      );
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(12),
      itemCount: evidence.citations.length,
      itemBuilder: (_, index) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: CitationCard(citation: evidence.citations[index]),
      ),
    );
  }

  Widget _buildDocumentsList(BuildContext context) {
    if (evidence.vaultDocuments.isEmpty) {
      return const Center(
        child: Text('Документів не знайдено',
            style: TextStyle(color: AppColors.textSecondary)),
      );
    }

    return ListView.builder(
      controller: scrollController,
      padding: const EdgeInsets.all(12),
      itemCount: evidence.vaultDocuments.length,
      itemBuilder: (_, index) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: DocumentCard(document: evidence.vaultDocuments[index]),
      ),
    );
  }
}

class _CountBadge extends StatelessWidget {
  final int count;
  const _CountBadge({required this.count});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.15),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Text(
        '$count',
        style: const TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: AppColors.primary,
        ),
      ),
    );
  }
}
