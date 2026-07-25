import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/chat_notifier.dart';
import '../../../../shared/theme/app_colors.dart';

class EvidenceBadge extends ConsumerWidget {
  final VoidCallback onTap;

  const EvidenceBadge({super.key, required this.onTap});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final evidence = ref.watch(
      chatNotifierProvider.select((s) => s.evidence),
    );

    if (!evidence.hasAny) return const SizedBox.shrink();

    final parts = <String>[];
    if (evidence.decisions.isNotEmpty) {
      parts.add('${evidence.decisions.length} рішень');
    }
    if (evidence.citations.isNotEmpty) {
      parts.add('${evidence.citations.length} норм');
    }
    if (evidence.vaultDocuments.isNotEmpty) {
      parts.add('${evidence.vaultDocuments.length} док.');
    }

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: AppColors.primary.withValues(alpha: 0.1),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: AppColors.primary.withValues(alpha: 0.3),
          ),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.description_outlined,
                size: 14, color: AppColors.primary),
            const SizedBox(width: 6),
            Text(
              parts.join(', '),
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppColors.primary,
              ),
            ),
            const SizedBox(width: 4),
            const Icon(Icons.keyboard_arrow_up,
                size: 14, color: AppColors.primary),
          ],
        ),
      ),
    );
  }
}
