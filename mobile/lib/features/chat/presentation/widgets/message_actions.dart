import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import '../../../../shared/theme/app_colors.dart';

class MessageActions extends StatelessWidget {
  final String role;
  final String content;
  final bool isLastAssistant;
  final VoidCallback? onRegenerate;
  final VoidCallback? onEdit;

  const MessageActions({
    super.key,
    required this.role,
    required this.content,
    this.isLastAssistant = false,
    this.onRegenerate,
    this.onEdit,
  });

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        // Copy
        _ActionButton(
          icon: Icons.copy_outlined,
          tooltip: 'Копіювати',
          onTap: () {
            Clipboard.setData(ClipboardData(text: content));
            ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(
                content: Text('Скопійовано'),
                duration: Duration(seconds: 1),
              ),
            );
          },
        ),

        // Regenerate (last assistant only)
        if (role == 'assistant' && isLastAssistant && onRegenerate != null)
          _ActionButton(
            icon: Icons.refresh,
            tooltip: 'Повторити',
            onTap: onRegenerate,
          ),

        // Edit (user messages only)
        if (role == 'user' && onEdit != null)
          _ActionButton(
            icon: Icons.edit_outlined,
            tooltip: 'Редагувати',
            onTap: onEdit,
          ),
      ],
    );
  }
}

class _ActionButton extends StatelessWidget {
  final IconData icon;
  final String tooltip;
  final VoidCallback? onTap;

  const _ActionButton({
    required this.icon,
    required this.tooltip,
    this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    return Tooltip(
      message: tooltip,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Padding(
          padding: const EdgeInsets.all(6),
          child: Icon(
            icon,
            size: 14,
            color: AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}
