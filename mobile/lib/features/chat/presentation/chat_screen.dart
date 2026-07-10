import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../domain/chat_notifier.dart';
import '../domain/chat_state.dart';
import 'widgets/message_bubble.dart';
import 'widgets/chat_input.dart';
import 'widgets/evidence_panel.dart';
import 'widgets/evidence_badge.dart';
import 'widgets/plan_review_sheet.dart';
import 'conversation_list.dart';
import 'widgets/chat_welcome.dart';

class ChatScreen extends ConsumerStatefulWidget {
  const ChatScreen({super.key});

  @override
  ConsumerState<ChatScreen> createState() => _ChatScreenState();
}

class _ChatScreenState extends ConsumerState<ChatScreen> {
  final _scrollController = ScrollController();
  final _sheetController = DraggableScrollableController();

  @override
  void dispose() {
    _scrollController.dispose();
    _sheetController.dispose();
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

      // Show plan review sheet when pending
      if (prev?.pendingPlanReview == null && next.pendingPlanReview != null) {
        _showPlanReview(context, next.pendingPlanReview!);
      }
    });

    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Чат'),
        leading: Builder(
          builder: (context) => IconButton(
            icon: const Icon(Icons.menu),
            onPressed: () => Scaffold.of(context).openDrawer(),
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
      drawer: const ConversationDrawer(),
      body: Stack(
        children: [
          // Main content
          Column(
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
                    ? ChatWelcome(
                        onSuggestionTap: (prompt) => ref
                            .read(chatNotifierProvider.notifier)
                            .sendMessage(prompt),
                      )
                    : ListView.builder(
                        controller: _scrollController,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        itemCount: chatState.messages.length,
                        itemBuilder: (_, index) {
                          final message = chatState.messages[index];
                          final isLastAssistant = message.role == 'assistant' &&
                              index == chatState.messages.length - 1;
                          return MessageBubble(
                            message: message,
                            isLastAssistant: isLastAssistant,
                            onRegenerate: isLastAssistant
                                ? () => ref
                                    .read(chatNotifierProvider.notifier)
                                    .regenerateLastMessage()
                                : null,
                            onEdit: (messageId, newContent) => ref
                                .read(chatNotifierProvider.notifier)
                                .editAndResend(messageId, newContent),
                          );
                        },
                      ),
              ),

              // Evidence badge
              EvidenceBadge(
                onTap: () {
                  ref.read(chatNotifierProvider.notifier).toggleEvidencePanel();
                  if (_sheetController.isAttached) {
                    _sheetController.animateTo(
                      0.45,
                      duration: const Duration(milliseconds: 300),
                      curve: Curves.easeOut,
                    );
                  }
                },
              ),

              // Input
              const ChatInput(),
            ],
          ),

          // Evidence panel overlay
          EvidencePanel(controller: _sheetController),
        ],
      ),
    );
  }

  void _showPlanReview(BuildContext context, PendingPlanReview pending) {
    final notifier = ref.read(chatNotifierProvider.notifier);
    var currentPlan = pending.plan;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      isDismissible: false,
      builder: (_) => PlanReviewSheet(
        plan: pending.plan,
        query: pending.query,
        onPlanChanged: (plan) => currentPlan = plan,
        onConfirm: () {
          Navigator.pop(context);
          notifier.confirmPlanAndExecute(currentPlan);
        },
        onSkip: () {
          Navigator.pop(context);
          notifier.skipPlanReview();
        },
        onCancel: () {
          Navigator.pop(context);
          notifier.cancelPlanReview();
        },
      ),
    );
  }
}
