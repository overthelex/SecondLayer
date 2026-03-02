import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../domain/chat_notifier.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../shared/widgets/loading_indicator.dart';

class ConversationListScreen extends ConsumerStatefulWidget {
  const ConversationListScreen({super.key});

  @override
  ConsumerState<ConversationListScreen> createState() =>
      _ConversationListScreenState();
}

class _ConversationListScreenState
    extends ConsumerState<ConversationListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
        () => ref.read(chatNotifierProvider.notifier).loadConversations());
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatNotifierProvider);
    final theme = Theme.of(context);
    final dateFormat = DateFormat('dd.MM.yyyy HH:mm', 'uk');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Розмови'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              ref.read(chatNotifierProvider.notifier).newConversation();
              context.pop();
            },
          ),
        ],
      ),
      body: chatState.isLoadingConversations
          ? const LoadingIndicator()
          : chatState.conversations.isEmpty
              ? const EmptyState(
                  icon: Icons.chat_bubble_outline,
                  title: 'Немає розмов',
                  subtitle: 'Почніть нову розмову з AI-помічником',
                )
              : ListView.separated(
                  itemCount: chatState.conversations.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, index) {
                    final conv = chatState.conversations[index];
                    return Dismissible(
                      key: Key(conv.id),
                      direction: DismissDirection.endToStart,
                      background: Container(
                        color: theme.colorScheme.error,
                        alignment: Alignment.centerRight,
                        padding: const EdgeInsets.only(right: 16),
                        child: const Icon(Icons.delete, color: Colors.white),
                      ),
                      confirmDismiss: (_) async {
                        return await showDialog<bool>(
                          context: context,
                          builder: (ctx) => AlertDialog(
                            title: const Text('Видалити розмову?'),
                            actions: [
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, false),
                                child: const Text('Скасувати'),
                              ),
                              TextButton(
                                onPressed: () => Navigator.pop(ctx, true),
                                child: const Text('Видалити'),
                              ),
                            ],
                          ),
                        );
                      },
                      onDismissed: (_) {
                        ref
                            .read(chatNotifierProvider.notifier)
                            .deleteConversation(conv.id);
                      },
                      child: ListTile(
                        title: Text(
                          conv.title,
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                        subtitle: Text(
                          dateFormat.format(conv.updatedAt),
                          style: theme.textTheme.bodySmall,
                        ),
                        selected: conv.id == chatState.conversationId,
                        onTap: () {
                          ref
                              .read(chatNotifierProvider.notifier)
                              .loadConversation(conv.id);
                          context.pop();
                        },
                      ),
                    );
                  },
                ),
    );
  }
}
