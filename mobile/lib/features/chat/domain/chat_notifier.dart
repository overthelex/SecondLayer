import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../../core/di/service_locator.dart';
import '../data/chat_repository.dart';
import '../data/models/message.dart';
import '../data/models/chat_event.dart';
import 'chat_state.dart';

final chatRepositoryProvider = Provider<ChatRepository>((ref) {
  return ChatRepository(api: sl.apiClient, sse: sl.sseClient);
});

final chatNotifierProvider =
    NotifierProvider<ChatNotifier, ChatState>(ChatNotifier.new);

class ChatNotifier extends Notifier<ChatState> {
  late final ChatRepository _repo;
  StreamSubscription? _subscription;
  static const _uuid = Uuid();

  @override
  ChatState build() {
    _repo = ref.read(chatRepositoryProvider);
    ref.onDispose(() => _subscription?.cancel());
    return const ChatState();
  }

  Future<void> sendMessage(String text) async {
    if (text.trim().isEmpty || state.isStreaming) return;

    // Add user message
    final userMsg = Message(
      id: _uuid.v4(),
      role: 'user',
      content: text.trim(),
      createdAt: DateTime.now(),
    );

    // Add placeholder assistant message
    final assistantMsg = Message(
      id: _uuid.v4(),
      role: 'assistant',
      content: '',
      isStreaming: true,
      createdAt: DateTime.now(),
    );

    state = state.copyWith(
      messages: [...state.messages, userMsg, assistantMsg],
      isStreaming: true,
      clearError: true,
    );

    final assistantId = assistantMsg.id;

    _subscription = await _repo.streamChat(
      query: text.trim(),
      history: state.messages
          .where((m) => m.id != assistantId && m.content.isNotEmpty)
          .toList(),
      budget: state.budget,
      conversationId: state.conversationId,
      onEvent: (event) => _handleEvent(event, assistantId),
      onDone: () => _finalizeStream(assistantId),
      onError: (error) {
        _updateAssistant(assistantId, (msg) => msg.copyWith(
          content: msg.content.isEmpty
              ? 'Помилка: $error'
              : msg.content,
          isStreaming: false,
        ));
        state = state.copyWith(
          isStreaming: false,
          error: error.toString(),
        );
      },
    );
  }

  void _handleEvent(ChatEvent event, String assistantId) {
    switch (event) {
      case PlanEvent(:final plan):
        _updateAssistant(assistantId, (msg) => msg.copyWith(
          executionPlan: plan,
        ));

      case ThinkingEvent(:final step, :final tool, :final description):
        _updateAssistant(assistantId, (msg) {
          final steps = List<ThinkingStep>.from(msg.thinkingSteps);
          steps.add(ThinkingStep(
            id: step.toString(),
            title: tool,
            content: description ?? '',
          ));
          return msg.copyWith(thinkingSteps: steps);
        });

      case ToolResultEvent(:final tool):
        _updateAssistant(assistantId, (msg) {
          // Mark the corresponding plan step as completed
          if (msg.executionPlan != null) {
            final updatedSteps = msg.executionPlan!.steps.map((s) {
              if (s.tool == tool) return s.copyWith(completed: true);
              return s;
            }).toList();
            return msg.copyWith(
              executionPlan: ExecutionPlan(
                goal: msg.executionPlan!.goal,
                steps: updatedSteps,
                expectedIterations: msg.executionPlan!.expectedIterations,
              ),
            );
          }
          return msg;
        });

      case AnswerDeltaEvent(:final text):
        _updateAssistant(assistantId, (msg) => msg.copyWith(
          content: msg.content + text,
        ));

      case AnswerEvent(:final text):
        _updateAssistant(assistantId, (msg) => msg.copyWith(
          content: text,
        ));

      case CompleteEvent(:final conversationId, :final toolsUsed, :final totalCostUsd, :final chargedUsd):
        if (conversationId != null) {
          state = state.copyWith(conversationId: conversationId);
        }
        _updateAssistant(assistantId, (msg) => msg.copyWith(
          isStreaming: false,
          costSummary: CostSummary(
            toolsUsed: toolsUsed,
            totalCostUsd: totalCostUsd,
            chargedUsd: chargedUsd,
          ),
        ));
        state = state.copyWith(isStreaming: false);

      case CostSummaryEvent(:final summary):
        _updateAssistant(assistantId, (msg) => msg.copyWith(
          costSummary: summary,
        ));

      case ErrorEvent(:final message):
        _updateAssistant(assistantId, (msg) => msg.copyWith(
          content: msg.content.isEmpty ? 'Помилка: $message' : msg.content,
          isStreaming: false,
        ));
        state = state.copyWith(isStreaming: false, error: message);

      case ResponseIdEvent():
      case CitationWarningEvent():
      case BudgetEscalatedEvent():
      case UnknownEvent():
        break;
    }
  }

  void _finalizeStream(String assistantId) {
    _updateAssistant(assistantId, (msg) => msg.copyWith(isStreaming: false));
    state = state.copyWith(isStreaming: false);
  }

  void _updateAssistant(String id, Message Function(Message) update) {
    final messages = state.messages.map((m) {
      if (m.id == id) return update(m);
      return m;
    }).toList();
    state = state.copyWith(messages: messages);
  }

  void setBudget(String budget) {
    state = state.copyWith(budget: budget);
  }

  void cancelStream() {
    _subscription?.cancel();
    _subscription = null;
    // Find any streaming message and finalize it
    final messages = state.messages.map((m) {
      if (m.isStreaming) return m.copyWith(isStreaming: false);
      return m;
    }).toList();
    state = state.copyWith(messages: messages, isStreaming: false);
  }

  Future<void> newConversation() async {
    cancelStream();
    state = state.copyWith(
      messages: [],
      clearConversation: true,
      clearError: true,
    );
  }

  Future<void> loadConversation(String id) async {
    try {
      final conversation = await _repo.getConversation(id);
      state = state.copyWith(
        messages: conversation.messages,
        conversationId: conversation.id,
        clearError: true,
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
  }

  Future<void> loadConversations() async {
    state = state.copyWith(isLoadingConversations: true);
    try {
      final conversations = await _repo.getConversations();
      state = state.copyWith(
        conversations: conversations,
        isLoadingConversations: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingConversations: false,
        error: e.toString(),
      );
    }
  }

  Future<void> deleteConversation(String id) async {
    await _repo.deleteConversation(id);
    state = state.copyWith(
      conversations:
          state.conversations.where((c) => c.id != id).toList(),
    );
    if (state.conversationId == id) {
      newConversation();
    }
  }
}
