import 'package:flutter/material.dart';
import '../../data/models/consultation_message.dart';
import '../../../../shared/theme/app_colors.dart';

class ConsultationMessageBubble extends StatelessWidget {
  final ConsultationMessage message;
  final bool isMe;
  final void Function(String attachmentId)? onSaveToVault;
  final bool isSavedToVault;

  const ConsultationMessageBubble({
    super.key,
    required this.message,
    required this.isMe,
    this.onSaveToVault,
    this.isSavedToVault = false,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 3),
      child: Column(
        crossAxisAlignment:
            isMe ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          // Sender name (for non-me messages)
          if (!isMe && message.senderName.isNotEmpty)
            Padding(
              padding: const EdgeInsets.only(left: 4, bottom: 2),
              child: Text(
                message.senderName,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: AppColors.primary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),

          // Bubble
          Container(
            constraints: BoxConstraints(
              maxWidth: MediaQuery.of(context).size.width * 0.78,
            ),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: isMe
                  ? (isDark ? AppColors.darkUserBubble : AppColors.userBubble)
                  : (isDark
                      ? AppColors.darkAssistantBubble
                      : AppColors.assistantBubble),
              borderRadius: BorderRadius.only(
                topLeft: const Radius.circular(16),
                topRight: const Radius.circular(16),
                bottomLeft: Radius.circular(isMe ? 16 : 4),
                bottomRight: Radius.circular(isMe ? 4 : 16),
              ),
              border: isMe
                  ? null
                  : Border.all(
                      color: isDark ? AppColors.darkBorder : AppColors.border,
                    ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Attachments
                if (message.attachments.isNotEmpty)
                  _AttachmentsDisplay(
                    attachments: message.attachments,
                    showVaultButton: !isMe && onSaveToVault != null,
                    isSavedToVault: isSavedToVault,
                    onSaveToVault: onSaveToVault,
                  ),

                // Text content
                if (message.content.isNotEmpty)
                  Text(
                    message.content,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: isDark
                          ? AppColors.darkTextPrimary
                          : AppColors.textPrimary,
                    ),
                  ),
              ],
            ),
          ),

          // Status indicators + time
          Padding(
            padding: const EdgeInsets.only(top: 2, left: 4, right: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              mainAxisAlignment:
                  isMe ? MainAxisAlignment.end : MainAxisAlignment.start,
              children: [
                Text(
                  _formatTime(message.createdAt),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                    fontSize: 10,
                  ),
                ),
                if (isMe) ...[
                  const SizedBox(width: 4),
                  _StatusIcon(status: message.status),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }

  String _formatTime(DateTime dt) {
    return '${dt.hour.toString().padLeft(2, '0')}:${dt.minute.toString().padLeft(2, '0')}';
  }
}

class _StatusIcon extends StatelessWidget {
  final String status;
  const _StatusIcon({required this.status});

  @override
  Widget build(BuildContext context) {
    switch (status) {
      case 'sending':
        return const Icon(Icons.access_time, size: 12, color: AppColors.textSecondary);
      case 'sent':
        return const Icon(Icons.check, size: 12, color: AppColors.textSecondary);
      case 'delivered':
        return const Icon(Icons.done_all, size: 12, color: AppColors.textSecondary);
      case 'read':
        return const Icon(Icons.done_all, size: 12, color: AppColors.primary);
      case 'failed':
        return const Icon(Icons.error_outline, size: 12, color: AppColors.error);
      default:
        return const SizedBox.shrink();
    }
  }
}

class _AttachmentsDisplay extends StatelessWidget {
  final List<ConsultationAttachment> attachments;
  final bool showVaultButton;
  final bool isSavedToVault;
  final void Function(String attachmentId)? onSaveToVault;

  const _AttachmentsDisplay({
    required this.attachments,
    this.showVaultButton = false,
    this.isSavedToVault = false,
    this.onSaveToVault,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        ...attachments.map((att) {
          if (att.type == 'image') {
            return Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Stack(
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: Image.network(
                      att.url,
                      width: 200,
                      fit: BoxFit.cover,
                      errorBuilder: (_, __, ___) => Container(
                        width: 200,
                        height: 100,
                        color: AppColors.surfaceVariant,
                        child: const Icon(Icons.broken_image),
                      ),
                    ),
                  ),
                  if (showVaultButton)
                    Positioned(
                      top: 4,
                      right: 4,
                      child: _VaultButton(
                        isSaved: isSavedToVault,
                        onTap: () => onSaveToVault?.call(att.id),
                      ),
                    ),
                ],
              ),
            );
          }
          return Container(
            margin: const EdgeInsets.only(bottom: 6),
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: AppColors.surfaceVariant,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.attach_file, size: 14),
                const SizedBox(width: 6),
                Flexible(
                  child: Text(
                    att.name,
                    style: theme.textTheme.bodySmall,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                  ),
                ),
                if (showVaultButton) ...[
                  const SizedBox(width: 6),
                  _VaultButton(
                    isSaved: isSavedToVault,
                    onTap: () => onSaveToVault?.call(att.id),
                  ),
                ],
              ],
            ),
          );
        }),
      ],
    );
  }
}

class _VaultButton extends StatefulWidget {
  final bool isSaved;
  final VoidCallback? onTap;

  const _VaultButton({required this.isSaved, this.onTap});

  @override
  State<_VaultButton> createState() => _VaultButtonState();
}

class _VaultButtonState extends State<_VaultButton> {
  bool _isSaving = false;

  @override
  Widget build(BuildContext context) {
    if (widget.isSaved) {
      return const Icon(
        Icons.check_circle,
        size: 20,
        color: Colors.green,
      );
    }

    if (_isSaving) {
      return const SizedBox(
        width: 20,
        height: 20,
        child: CircularProgressIndicator(strokeWidth: 2),
      );
    }

    return GestureDetector(
      onTap: () async {
        setState(() => _isSaving = true);
        widget.onTap?.call();
        // The parent will update isSaved via state
        // but keep spinner for a moment in case of delay
        await Future.delayed(const Duration(milliseconds: 500));
        if (mounted && !widget.isSaved) {
          setState(() => _isSaving = false);
        }
      },
      child: const Icon(
        Icons.folder_outlined,
        size: 20,
        color: AppColors.textSecondary,
      ),
    );
  }
}
