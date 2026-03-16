import 'package:flutter/material.dart';
import '../../data/models/message.dart';
import '../../../../shared/theme/app_colors.dart';

class CitationWarningsStrip extends StatelessWidget {
  final List<CitationWarning> warnings;

  const CitationWarningsStrip({super.key, required this.warnings});

  Color _chipColor(String status) {
    switch (status) {
      case 'verified':
        return AppColors.success;
      case 'unverified':
        return AppColors.warning;
      case 'not_found':
        return AppColors.error;
      default:
        return AppColors.textSecondary;
    }
  }

  String _statusLabel(String status) {
    switch (status) {
      case 'verified':
        return 'Перевірено';
      case 'unverified':
        return 'Не перевірено';
      case 'not_found':
        return 'Не знайдено';
      default:
        return status;
    }
  }

  @override
  Widget build(BuildContext context) {
    if (warnings.isEmpty) return const SizedBox.shrink();

    return SizedBox(
      height: 28,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: warnings.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, index) {
          final w = warnings[index];
          final color = _chipColor(w.status);

          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              borderRadius: BorderRadius.circular(12),
              border: Border.all(
                color: color.withValues(alpha: 0.3),
              ),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(
                  w.status == 'verified'
                      ? Icons.check_circle
                      : w.status == 'not_found'
                          ? Icons.cancel
                          : Icons.help,
                  size: 12,
                  color: color,
                ),
                const SizedBox(width: 4),
                Text(
                  w.caseNumber != null
                      ? '${w.caseNumber}: ${_statusLabel(w.status)}'
                      : _statusLabel(w.status),
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w500,
                    color: color,
                  ),
                ),
                if (w.confidence != null) ...[
                  const SizedBox(width: 4),
                  Text(
                    '${(w.confidence! * 100).toStringAsFixed(0)}%',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w600,
                      color: color,
                    ),
                  ),
                ],
              ],
            ),
          );
        },
      ),
    );
  }
}
