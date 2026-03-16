import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:uuid/uuid.dart';
import '../../../core/di/service_locator.dart';
import '../data/chat_repository.dart';
import '../data/models/message.dart';
import '../data/models/chat_event.dart';
import '../data/evidence_extractor.dart';
import 'evidence_aggregator.dart';
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
        _updateAssistant(
            assistantId,
            (msg) => msg.copyWith(
                  content:
                      msg.content.isEmpty ? 'Помилка: $error' : msg.content,
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
        _updateAssistant(
            assistantId,
            (msg) => msg.copyWith(
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

      case ToolResultEvent(:final tool, :final result):
        _updateAssistant(assistantId, (msg) {
          var updated = msg;

          // Mark the corresponding plan step as completed
          if (msg.executionPlan != null) {
            final updatedSteps = msg.executionPlan!.steps.map((s) {
              if (s.tool == tool) return s.copyWith(completed: true);
              return s;
            }).toList();
            updated = updated.copyWith(
              executionPlan: ExecutionPlan(
                goal: msg.executionPlan!.goal,
                steps: updatedSteps,
                expectedIterations: msg.executionPlan!.expectedIterations,
              ),
            );
          }

          // Extract evidence from tool result
          final evidence = extractEvidence(tool, result);
          if (!evidence.isEmpty) {
            updated = updated.copyWith(
              decisions: [...updated.decisions, ...evidence.decisions],
              citations: [...updated.citations, ...evidence.citations],
              documents: [...updated.documents, ...evidence.documents],
            );
          }

          return updated;
        });
        _refreshEvidence();

      case AnswerDeltaEvent(:final text):
        _updateAssistant(
            assistantId,
            (msg) => msg.copyWith(
                  content: msg.content + text,
                ));

      case AnswerEvent(:final text):
        _updateAssistant(
            assistantId,
            (msg) => msg.copyWith(
                  content: text,
                ));

      case CompleteEvent(
          :final conversationId,
          :final toolsUsed,
          :final totalCostUsd,
          :final chargedUsd
        ):
        if (conversationId != null) {
          state = state.copyWith(conversationId: conversationId);
        }
        _updateAssistant(
            assistantId,
            (msg) => msg.copyWith(
                  isStreaming: false,
                  costSummary: CostSummary(
                    toolsUsed: toolsUsed,
                    totalCostUsd: totalCostUsd,
                    chargedUsd: chargedUsd,
                  ),
                ));
        state = state.copyWith(isStreaming: false);
        _refreshEvidence();

      case CostSummaryEvent(:final summary):
        _updateAssistant(
            assistantId,
            (msg) => msg.copyWith(
                  costSummary: summary,
                ));

      case CitationWarningEvent(:final data):
        _updateAssistant(assistantId, (msg) {
          final warning = CitationWarning.fromJson(data);
          return msg.copyWith(
            citationWarnings: [...msg.citationWarnings, warning],
          );
        });

      case BudgetEscalatedEvent(:final reason):
        // Show as a thinking step so user sees it
        _updateAssistant(assistantId, (msg) {
          final steps = List<ThinkingStep>.from(msg.thinkingSteps);
          steps.add(ThinkingStep(
            id: 'budget_escalated',
            title: 'Бюджет підвищено',
            content: reason,
            isComplete: true,
          ));
          return msg.copyWith(thinkingSteps: steps);
        });

      case ErrorEvent(:final message):
        _updateAssistant(
            assistantId,
            (msg) => msg.copyWith(
                  content:
                      msg.content.isEmpty ? 'Помилка: $message' : msg.content,
                  isStreaming: false,
                ));
        state = state.copyWith(isStreaming: false, error: message);

      case ResponseIdEvent():
      case UnknownEvent():
        break;
    }
  }

  void _finalizeStream(String assistantId) {
    _updateAssistant(assistantId, (msg) => msg.copyWith(isStreaming: false));
    state = state.copyWith(isStreaming: false);
    _refreshEvidence();
  }

  void _updateAssistant(String id, Message Function(Message) update) {
    final messages = state.messages.map((m) {
      if (m.id == id) return update(m);
      return m;
    }).toList();
    state = state.copyWith(messages: messages);
  }

  void _refreshEvidence() {
    final evidence = aggregateEvidence(state.messages);
    state = state.copyWith(evidence: evidence);
  }

  void setBudget(String budget) {
    state = state.copyWith(budget: budget);
  }

  void setSelectedTool(String tool) {
    state = state.copyWith(selectedTool: tool);
  }

  void toggleEvidencePanel() {
    state =
        state.copyWith(isEvidencePanelOpen: !state.isEvidencePanelOpen);
  }

  void addAttachment(FileAttachment attachment) {
    state = state.copyWith(
      pendingAttachments: [...state.pendingAttachments, attachment],
    );
  }

  void removeAttachment(String name) {
    state = state.copyWith(
      pendingAttachments:
          state.pendingAttachments.where((a) => a.name != name).toList(),
    );
  }

  void cancelStream() {
    _subscription?.cancel();
    _subscription = null;
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
      clearPendingPlan: true,
      evidence: const EvidenceState(),
      isEvidencePanelOpen: false,
      pendingAttachments: [],
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
      _refreshEvidence();
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

  void regenerateLastMessage() {
    // Find last user message
    final lastUserMsg = state.messages.lastWhere(
      (m) => m.role == 'user',
      orElse: () => const Message(id: '', role: 'user', content: ''),
    );
    if (lastUserMsg.content.isEmpty) return;

    // Remove last assistant message
    final messages = List<Message>.from(state.messages);
    if (messages.isNotEmpty && messages.last.role == 'assistant') {
      messages.removeLast();
    }
    state = state.copyWith(messages: messages);

    sendMessage(lastUserMsg.content);
  }

  void editAndResend(String messageId, String newContent) {
    // Find message index and remove everything after it
    final idx = state.messages.indexWhere((m) => m.id == messageId);
    if (idx < 0) return;

    final messages = state.messages.sublist(0, idx);
    state = state.copyWith(messages: messages);
    _refreshEvidence();

    sendMessage(newContent);
  }

  Future<void> requestPlan(String query) async {
    state = state.copyWith(isPlanLoading: true);
    try {
      final planData = await _repo.requestPlan(query, state.budget);
      final plan = ExecutionPlan.fromJson(planData);

      final assistantId = _uuid.v4();
      state = state.copyWith(
        isPlanLoading: false,
        pendingPlanReview: PendingPlanReview(
          plan: plan,
          planSessionId: planData['session_id'] as String? ?? '',
          query: query,
          assistantMessageId: assistantId,
        ),
      );
    } catch (e) {
      state = state.copyWith(
        isPlanLoading: false,
        error: e.toString(),
      );
    }
  }

  Future<void> confirmPlanAndExecute(ExecutionPlan approvedPlan) async {
    final pending = state.pendingPlanReview;
    if (pending == null) return;

    state = state.copyWith(clearPendingPlan: true);

    // Add user message
    final userMsg = Message(
      id: _uuid.v4(),
      role: 'user',
      content: pending.query,
      createdAt: DateTime.now(),
    );

    // Add placeholder assistant message
    final assistantMsg = Message(
      id: _uuid.v4(),
      role: 'assistant',
      content: '',
      isStreaming: true,
      executionPlan: approvedPlan,
      createdAt: DateTime.now(),
    );

    state = state.copyWith(
      messages: [...state.messages, userMsg, assistantMsg],
      isStreaming: true,
      clearError: true,
    );

    final assistantId = assistantMsg.id;

    _subscription = await _repo.streamChat(
      query: pending.query,
      history: state.messages
          .where((m) => m.id != assistantId && m.content.isNotEmpty)
          .toList(),
      budget: state.budget,
      conversationId: state.conversationId,
      approvedPlan: approvedPlan,
      onEvent: (event) => _handleEvent(event, assistantId),
      onDone: () => _finalizeStream(assistantId),
      onError: (error) {
        _updateAssistant(
            assistantId,
            (msg) => msg.copyWith(
                  content:
                      msg.content.isEmpty ? 'Помилка: $error' : msg.content,
                  isStreaming: false,
                ));
        state = state.copyWith(isStreaming: false, error: error.toString());
      },
    );
  }

  void skipPlanReview() {
    final pending = state.pendingPlanReview;
    if (pending == null) return;

    state = state.copyWith(clearPendingPlan: true);
    sendMessage(pending.query);
  }

  void cancelPlanReview() {
    state = state.copyWith(clearPendingPlan: true);
  }
}
