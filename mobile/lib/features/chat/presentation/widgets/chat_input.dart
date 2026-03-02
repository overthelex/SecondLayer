import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../domain/chat_notifier.dart';

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
          // Budget chips
          SizedBox(
            height: 32,
            child: Row(
              children: [
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
