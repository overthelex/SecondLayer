import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import '../domain/chat_notifier.dart';
import '../data/models/message.dart';
import '../../../shared/theme/app_colors.dart';

/// Drawer version of conversation list, matching web sidebar.
class ConversationDrawer extends ConsumerStatefulWidget {
  const ConversationDrawer({super.key});

  @override
  ConsumerState<ConversationDrawer> createState() =>
      _ConversationDrawerState();
}

class _ConversationDrawerState extends ConsumerState<ConversationDrawer> {
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

    return Drawer(
      backgroundColor: theme.colorScheme.surface,
      child: SafeArea(
        child: Column(
          children: [
            // Header
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Container(
                    width: 36,
                    height: 36,
                    decoration: BoxDecoration(
                      color: AppColors.primary.withValues(alpha: 0.12),
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: const Icon(Icons.balance,
                        size: 20, color: AppColors.primary),
                  ),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      'SecondLayer',
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                ],
              ),
            ),

            // New conversation button
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  onPressed: () {
                    ref.read(chatNotifierProvider.notifier).newConversation();
                    Navigator.pop(context);
                  },
                  icon: const Icon(Icons.add, size: 18),
                  label: const Text('Нова розмова'),
                  style: ElevatedButton.styleFrom(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                  ),
                ),
              ),
            ),

            const SizedBox(height: 12),
            const Divider(height: 1),

            // Conversations list
            Expanded(
              child: chatState.isLoadingConversations
                  ? const Center(child: CircularProgressIndicator())
                  : chatState.conversations.isEmpty
                      ? Center(
                          child: Text(
                            'Немає розмов',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        )
                      : _GroupedConversationList(
                          conversations: chatState.conversations,
                          selectedId: chatState.conversationId,
                          onTap: (id) {
                            ref
                                .read(chatNotifierProvider.notifier)
                                .loadConversation(id);
                            Navigator.pop(context);
                          },
                          onDelete: (id) {
                            ref
                                .read(chatNotifierProvider.notifier)
                                .deleteConversation(id);
                          },
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

class _GroupedConversationList extends StatelessWidget {
  final List<Conversation> conversations;
  final String? selectedId;
  final ValueChanged<String> onTap;
  final ValueChanged<String> onDelete;

  const _GroupedConversationList({
    required this.conversations,
    this.selectedId,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final yesterday = today.subtract(const Duration(days: 1));
    final weekAgo = today.subtract(const Duration(days: 7));

    final todayConvs = <Conversation>[];
    final yesterdayConvs = <Conversation>[];
    final weekConvs = <Conversation>[];
    final olderConvs = <Conversation>[];

    for (final c in conversations) {
      final date = DateTime(c.updatedAt.year, c.updatedAt.month, c.updatedAt.day);
      if (date == today || date.isAfter(today)) {
        todayConvs.add(c);
      } else if (date == yesterday || date.isAfter(yesterday)) {
        yesterdayConvs.add(c);
      } else if (date.isAfter(weekAgo)) {
        weekConvs.add(c);
      } else {
        olderConvs.add(c);
      }
    }

    return ListView(
      padding: const EdgeInsets.symmetric(vertical: 8),
      children: [
        if (todayConvs.isNotEmpty)
          _buildGroup(context, theme, 'Сьогодні', todayConvs),
        if (yesterdayConvs.isNotEmpty)
          _buildGroup(context, theme, 'Вчора', yesterdayConvs),
        if (weekConvs.isNotEmpty)
          _buildGroup(context, theme, 'Останні 7 днів', weekConvs),
        if (olderConvs.isNotEmpty)
          _buildGroup(context, theme, 'Раніше', olderConvs),
      ],
    );
  }

  Widget _buildGroup(
    BuildContext context,
    ThemeData theme,
    String label,
    List<Conversation> convs,
  ) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
          child: Text(
            label,
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
        ...convs.map((c) => _ConversationTile(
              conversation: c,
              isSelected: c.id == selectedId,
              onTap: () => onTap(c.id),
              onDelete: () => onDelete(c.id),
            )),
      ],
    );
  }
}

class _ConversationTile extends StatelessWidget {
  final Conversation conversation;
  final bool isSelected;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const _ConversationTile({
    required this.conversation,
    required this.isSelected,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Dismissible(
      key: Key(conversation.id),
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
      onDismissed: (_) => onDelete(),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 8, vertical: 1),
        decoration: BoxDecoration(
          color: isSelected
              ? AppColors.primary.withValues(alpha: 0.08)
              : Colors.transparent,
          borderRadius: BorderRadius.circular(8),
        ),
        child: ListTile(
          dense: true,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
          title: Text(
            conversation.title,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: theme.textTheme.bodyMedium?.copyWith(
              fontWeight: isSelected ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
          subtitle: Text(
            DateFormat('dd.MM.yyyy HH:mm', 'uk').format(conversation.updatedAt),
            style: theme.textTheme.labelSmall?.copyWith(
              color: theme.colorScheme.onSurfaceVariant,
            ),
          ),
          onTap: onTap,
          onLongPress: () => _showContextMenu(context),
        ),
      ),
    );
  }

  void _showContextMenu(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (ctx) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const Icon(Icons.delete_outline),
              title: const Text('Видалити'),
              onTap: () {
                Navigator.pop(ctx);
                onDelete();
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// Kept for backward compatibility if used elsewhere.
/// Now the primary UI is ConversationDrawer.
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

    return Scaffold(
      appBar: AppBar(
        title: const Text('Розмови'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () {
              ref.read(chatNotifierProvider.notifier).newConversation();
              Navigator.pop(context);
            },
          ),
        ],
      ),
      body: chatState.isLoadingConversations
          ? const Center(child: CircularProgressIndicator())
          : chatState.conversations.isEmpty
              ? Center(
                  child: Text(
                    'Немає розмов',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                )
              : ListView.separated(
                  itemCount: chatState.conversations.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, index) {
                    final conv = chatState.conversations[index];
                    return ListTile(
                      title: Text(
                        conv.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                      ),
                      subtitle: Text(
                        DateFormat('dd.MM.yyyy HH:mm', 'uk')
                            .format(conv.updatedAt),
                        style: theme.textTheme.bodySmall,
                      ),
                      selected: conv.id == chatState.conversationId,
                      onTap: () {
                        ref
                            .read(chatNotifierProvider.notifier)
                            .loadConversation(conv.id);
                        Navigator.pop(context);
                      },
                    );
                  },
                ),
    );
  }
}
