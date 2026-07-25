import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/consultation_notifier.dart';
import 'widgets/consultation_message_bubble.dart';
import 'widgets/consultation_input.dart';

class ConsultationChatScreen extends ConsumerStatefulWidget {
  final String consultationId;

  const ConsultationChatScreen({super.key, required this.consultationId});

  @override
  ConsumerState<ConsultationChatScreen> createState() =>
      _ConsultationChatScreenState();
}

class _ConsultationChatScreenState
    extends ConsumerState<ConsultationChatScreen> {
  final _scrollController = ScrollController();

  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref
        .read(consultationChatProvider(widget.consultationId).notifier)
        .loadMessages());
  }

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
    final chatState =
        ref.watch(consultationChatProvider(widget.consultationId));

    ref.listen(consultationChatProvider(widget.consultationId), (prev, next) {
      if ((prev?.messages.length ?? 0) != next.messages.length) {
        _scrollToBottom();
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('Консультація'),
      ),
      body: Column(
        children: [
          // Messages
          Expanded(
            child: chatState.isLoading
                ? const Center(child: CircularProgressIndicator())
                : chatState.messages.isEmpty
                    ? const Center(
                        child: Text('Повідомлень немає'),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: chatState.messages.length,
                        itemBuilder: (_, index) {
                          return ConsultationMessageBubble(
                            message: chatState.messages[index],
                            isMe: chatState.messages[index].senderId == 'me',
                            onSaveToVault: chatState.messages[index].attachments.isNotEmpty
                                ? (attachmentId) => ref
                                    .read(consultationChatProvider(
                                            widget.consultationId)
                                        .notifier)
                                    .saveAttachmentToVault(
                                      messageId:
                                          chatState.messages[index].id,
                                      attachmentId: attachmentId,
                                    )
                                : null,
                            isSavedToVault:
                                chatState.savedAttachmentMessageIds
                                    .contains(chatState.messages[index].id),
                          );
                        },
                      ),
          ),

          // Typing indicator
          if (chatState.typingUserName != null)
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Row(
                children: [
                  const SizedBox(
                    width: 16,
                    height: 16,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  ),
                  const SizedBox(width: 8),
                  Text(
                    '${chatState.typingUserName} друкує...',
                    style: Theme.of(context).textTheme.bodySmall?.copyWith(
                          color: Theme.of(context)
                              .colorScheme
                              .onSurfaceVariant,
                        ),
                  ),
                ],
              ),
            ),

          // Input
          ConsultationInput(
            onSend: (text) => ref
                .read(
                    consultationChatProvider(widget.consultationId).notifier)
                .sendMessage(text),
            onTyping: () => ref
                .read(
                    consultationChatProvider(widget.consultationId).notifier)
                .onTyping(),
          ),
        ],
      ),
    );
  }
}
