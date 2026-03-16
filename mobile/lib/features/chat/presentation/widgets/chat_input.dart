import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:file_picker/file_picker.dart';
import '../../domain/chat_notifier.dart';
import '../../data/models/message.dart';
import '../../../../shared/theme/app_colors.dart';
import 'tool_selector_sheet.dart';

class ChatInput extends ConsumerStatefulWidget {
  const ChatInput({super.key});

  @override
  ConsumerState<ChatInput> createState() => _ChatInputState();
}

class _ChatInputState extends ConsumerState<ChatInput> {
  final _controller = TextEditingController();
  final _focusNode = FocusNode();

  @override
  void dispose() {
    _controller.dispose();
    _focusNode.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatNotifierProvider);
    final theme = Theme.of(context);

    return Container(
      padding: EdgeInsets.only(
        left: 12,
        right: 12,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(
            color: theme.colorScheme.outline.withValues(alpha: 0.2),
          ),
        ),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Pending attachments
          if (chatState.pendingAttachments.isNotEmpty)
            _AttachmentsRow(
              attachments: chatState.pendingAttachments,
              onRemove: (name) =>
                  ref.read(chatNotifierProvider.notifier).removeAttachment(name),
            ),

          // Tool selector + budget chips row
          SizedBox(
            height: 32,
            child: Row(
              children: [
                // Tool selector pill
                _ToolPill(
                  selectedTool: chatState.selectedTool,
                  onTap: () => _showToolSelector(context, chatState.selectedTool),
                ),
                const SizedBox(width: 8),
                Container(
                  width: 1,
                  height: 16,
                  color: AppColors.border,
                ),
                const SizedBox(width: 8),
                // Budget chips
                _BudgetChip(
                  label: 'Швидко',
                  value: 'quick',
                  selected: chatState.budget == 'quick',
                  onTap: () =>
                      ref.read(chatNotifierProvider.notifier).setBudget('quick'),
                ),
                const SizedBox(width: 8),
                _BudgetChip(
                  label: 'Стандарт',
                  value: 'standard',
                  selected: chatState.budget == 'standard',
                  onTap: () => ref
                      .read(chatNotifierProvider.notifier)
                      .setBudget('standard'),
                ),
                const SizedBox(width: 8),
                _BudgetChip(
                  label: 'Глибоко',
                  value: 'deep',
                  selected: chatState.budget == 'deep',
                  onTap: () =>
                      ref.read(chatNotifierProvider.notifier).setBudget('deep'),
                ),
              ],
            ),
          ),
          const SizedBox(height: 8),

          // Input row
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              // File attachment button
              IconButton(
                onPressed: _pickFile,
                icon: const Icon(Icons.attach_file, size: 20),
                style: IconButton.styleFrom(
                  foregroundColor: theme.colorScheme.onSurfaceVariant,
                  padding: const EdgeInsets.all(8),
                  minimumSize: const Size(36, 36),
                ),
              ),

              // Text field
              Expanded(
                child: TextField(
                  controller: _controller,
                  focusNode: _focusNode,
                  maxLines: 4,
                  minLines: 1,
                  textInputAction: TextInputAction.newline,
                  decoration: InputDecoration(
                    hintText: 'Введіть повідомлення...',
                    border: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(24),
                    ),
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 10,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              if (chatState.isStreaming)
                IconButton.filled(
                  onPressed: () =>
                      ref.read(chatNotifierProvider.notifier).cancelStream(),
                  icon: const Icon(Icons.stop),
                  style: IconButton.styleFrom(
                    backgroundColor: theme.colorScheme.error,
                  ),
                )
              else
                IconButton.filled(
                  onPressed: () => _send(),
                  icon: const Icon(Icons.send),
                ),
            ],
          ),
        ],
      ),
    );
  }

  void _send() {
    final text = _controller.text.trim();
    if (text.isEmpty) return;
    ref.read(chatNotifierProvider.notifier).sendMessage(text);
    _controller.clear();
    _focusNode.requestFocus();
  }

  Future<void> _pickFile() async {
    final result = await FilePicker.platform.pickFiles();
    if (result == null || result.files.isEmpty) return;

    final file = result.files.first;
    ref.read(chatNotifierProvider.notifier).addAttachment(
          FileAttachment(
            name: file.name,
            size: file.size,
          ),
        );
  }

  void _showToolSelector(BuildContext context, String selectedTool) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ToolSelectorSheet(
        selectedTool: selectedTool,
        onToolSelected: (tool) {
          ref.read(chatNotifierProvider.notifier).setSelectedTool(tool);
        },
      ),
    );
  }
}

class _ToolPill extends StatelessWidget {
  final String selectedTool;
  final VoidCallback onTap;

  const _ToolPill({required this.selectedTool, required this.onTap});

  String get _label {
    if (selectedTool == 'ai_chat') return 'AI Чат';
    // Shorten long tool names
    return selectedTool.replaceAll('_', ' ').length > 12
        ? '${selectedTool.replaceAll('_', ' ').substring(0, 12)}...'
        : selectedTool.replaceAll('_', ' ');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDefault = selectedTool == 'ai_chat';

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
        decoration: BoxDecoration(
          color: isDefault
              ? theme.colorScheme.surfaceContainerHighest
              : AppColors.primary.withValues(alpha: 0.12),
          borderRadius: BorderRadius.circular(16),
          border: isDefault
              ? null
              : Border.all(color: AppColors.primary.withValues(alpha: 0.3)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(
              isDefault ? Icons.auto_awesome : Icons.build_outlined,
              size: 12,
              color: isDefault
                  ? theme.colorScheme.onSurfaceVariant
                  : AppColors.primary,
            ),
            const SizedBox(width: 4),
            Text(
              _label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w500,
                color: isDefault
                    ? theme.colorScheme.onSurfaceVariant
                    : AppColors.primary,
              ),
            ),
            const SizedBox(width: 2),
            Icon(
              Icons.keyboard_arrow_down,
              size: 12,
              color: isDefault
                  ? theme.colorScheme.onSurfaceVariant
                  : AppColors.primary,
            ),
          ],
        ),
      ),
    );
  }
}

class _BudgetChip extends StatelessWidget {
  final String label;
  final String value;
  final bool selected;
  final VoidCallback onTap;

  const _BudgetChip({
    required this.label,
    required this.value,
    required this.selected,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
        decoration: BoxDecoration(
          color: selected
              ? theme.colorScheme.primary
              : theme.colorScheme.surfaceContainerHighest,
          borderRadius: BorderRadius.circular(16),
        ),
        child: Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: selected
                ? theme.colorScheme.onPrimary
                : theme.colorScheme.onSurfaceVariant,
          ),
        ),
      ),
    );
  }
}

class _AttachmentsRow extends StatelessWidget {
  final List<FileAttachment> attachments;
  final ValueChanged<String> onRemove;

  const _AttachmentsRow({required this.attachments, required this.onRemove});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      height: 36,
      margin: const EdgeInsets.only(bottom: 8),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: attachments.length,
        separatorBuilder: (_, __) => const SizedBox(width: 6),
        itemBuilder: (_, index) {
          final att = attachments[index];
          return Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: theme.colorScheme.surfaceContainerHighest,
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                if (att.uploading)
                  const SizedBox(
                    width: 12,
                    height: 12,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                else
                  const Icon(Icons.attach_file, size: 12),
                const SizedBox(width: 4),
                Text(
                  att.name.length > 20
                      ? '${att.name.substring(0, 20)}...'
                      : att.name,
                  style: theme.textTheme.labelSmall,
                ),
                const SizedBox(width: 4),
                GestureDetector(
                  onTap: () => onRemove(att.name),
                  child: const Icon(Icons.close, size: 12),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
