import 'package:flutter/material.dart';
import '../../data/models/message.dart';
import '../../../../shared/theme/app_colors.dart';

class DecisionCard extends StatelessWidget {
  final Decision decision;
  final VoidCallback? onTap;

  const DecisionCard({super.key, required this.decision, this.onTap});

  Color _statusColor(String? status) {
    switch (status) {
      case 'active':
        return AppColors.statusActive;
      case 'overturned':
        return AppColors.statusOverturned;
      case 'modified':
        return AppColors.statusModified;
      default:
        return AppColors.textSecondary;
    }
  }

  String _statusLabel(String? status) {
    switch (status) {
      case 'active':
        return 'Чинне';
      case 'overturned':
        return 'Скасовано';
      case 'modified':
        return 'Змінено';
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: theme.colorScheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: theme.colorScheme.outline.withValues(alpha: 0.2),
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            // Court name
            Text(
              decision.court,
              style: theme.textTheme.labelSmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),

            // Case number + status row
            Row(
              children: [
                Expanded(
                  child: Text(
                    decision.number,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      fontWeight: FontWeight.w600,
                    ),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (decision.status != null && decision.status!.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                    decoration: BoxDecoration(
                      color: _statusColor(decision.status).withValues(alpha: 0.15),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Text(
                      _statusLabel(decision.status),
                      style: TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: _statusColor(decision.status),
                      ),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: 4),

            // Date + relevance row
            Row(
              children: [
                Text(
                  decision.date,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
                if (decision.documentType != null &&
                    decision.documentType!.isNotEmpty) ...[
                  const SizedBox(width: 8),
                  Text(
                    decision.documentType!,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: AppColors.primary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
                const Spacer(),
                if (decision.relevance > 0)
                  Container(
                    padding:
                        const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '${(decision.relevance * 100).toStringAsFixed(0)}%',
                      style: const TextStyle(
                        fontSize: 10,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
              ],
            ),

            // Summary
            if (decision.summary.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                decision.summary,
                style: theme.textTheme.bodySmall,
                maxLines: 3,
                overflow: TextOverflow.ellipsis,
              ),
            ],
          ],
        ),
      ),
    );
  }
}
