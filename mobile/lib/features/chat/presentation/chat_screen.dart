import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/chat_notifier.dart';
import 'widgets/message_bubble.dart';
import 'widgets/chat_input.dart';
import 'conversation_list.dart';
import '../../../shared/widgets/empty_state.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _scrollToBottom() {
    if (_scrollController.hasClients) {
      Future.delayed(const Duration(milliseconds: 50), () {
        if (_scrollController.hasClients) {
          _scrollController.animateTo(
            _scrollController.position.maxScrollExtent,
            duration: const Duration(milliseconds: 200),
            curve: Curves.easeOut,
          );
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final chatState = ref.watch(chatNotifierProvider);

    // Auto-scroll when messages change
    ref.listen(chatNotifierProvider, (prev, next) {
      if (prev?.messages.length != next.messages.length ||
          next.isStreaming) {
        _scrollToBottom();
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Чат'),
        leading: IconButton(
          icon: const Icon(Icons.menu),
          onPressed: () => Navigator.push(
            context,
            MaterialPageRoute(
                builder: (_) => const ConversationListScreen()),
          ),
        ),
        actions: [
          IconButton(
            icon: const Icon(Icons.add_comment_outlined),
            onPressed: () =>
                ref.read(chatNotifierProvider.notifier).newConversation(),
          ),
        ],
      ),
      body: Column(
        children: [
          // Error banner
          if (chatState.error != null)
            MaterialBanner(
              content: Text(chatState.error!),
              backgroundColor:
                  Theme.of(context).colorScheme.errorContainer,
              actions: [
                TextButton(
                  onPressed: () => ref
                      .read(chatNotifierProvider.notifier)
                      .sendMessage(''),
                  child: const Text('OK'),
                ),
              ],
            ),

          // Messages
          Expanded(
            child: chatState.messages.isEmpty
                ? const EmptyState(
                    icon: Icons.chat_bubble_outline,
                    title: 'Почніть розмову',
                    subtitle:
                        'Задайте питання про судову практику,\nзаконодавство або правові документи',
                  )
                : ListView.builder(
                    controller: _scrollController,
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    itemCount: chatState.messages.length,
                    itemBuilder: (_, index) {
                      return MessageBubble(
                        message: chatState.messages[index],
                      );
                    },
                  ),
          ),

          // Input
          const ChatInput(),
        ],
      ),
    );
  }
}
