import '../data/models/message.dart';

class ChatState {
  final List<Message> messages;
  final bool isStreaming;
  final String? error;
  final String? conversationId;
  final String budget; // 'quick' | 'standard' | 'deep'
  final List<Conversation> conversations;
  final bool isLoadingConversations;
  final String selectedTool; // 'ai_chat' or specific tool name
  final PendingPlanReview? pendingPlanReview;
  final bool isPlanLoading;
  final EvidenceState evidence;
  final bool isEvidencePanelOpen;
  final List<FileAttachment> pendingAttachments;

  const ChatState({
    this.messages = const [],
    this.isStreaming = false,
    this.error,
    this.conversationId,
    this.budget = 'standard',
    this.conversations = const [],
    this.isLoadingConversations = false,
    this.selectedTool = 'ai_chat',
    this.pendingPlanReview,
    this.isPlanLoading = false,
    this.evidence = const EvidenceState(),
    this.isEvidencePanelOpen = false,
    this.pendingAttachments = const [],
  });

  ChatState copyWith({
    List<Message>? messages,
    bool? isStreaming,
    String? error,
    String? conversationId,
    String? budget,
    List<Conversation>? conversations,
    bool? isLoadingConversations,
    String? selectedTool,
    PendingPlanReview? pendingPlanReview,
    bool? isPlanLoading,
    EvidenceState? evidence,
    bool? isEvidencePanelOpen,
    List<FileAttachment>? pendingAttachments,
    bool clearError = false,
    bool clearConversation = false,
    bool clearPendingPlan = false,
  }) =>
      ChatState(
        messages: messages ?? this.messages,
        isStreaming: isStreaming ?? this.isStreaming,
        error: clearError ? null : (error ?? this.error),
        conversationId:
            clearConversation ? null : (conversationId ?? this.conversationId),
        budget: budget ?? this.budget,
        conversations: conversations ?? this.conversations,
        isLoadingConversations:
            isLoadingConversations ?? this.isLoadingConversations,
        selectedTool: selectedTool ?? this.selectedTool,
        pendingPlanReview: clearPendingPlan
            ? null
            : (pendingPlanReview ?? this.pendingPlanReview),
        isPlanLoading: isPlanLoading ?? this.isPlanLoading,
        evidence: evidence ?? this.evidence,
        isEvidencePanelOpen:
            isEvidencePanelOpen ?? this.isEvidencePanelOpen,
        pendingAttachments: pendingAttachments ?? this.pendingAttachments,
      );
}

class EvidenceState {
  final List<Decision> decisions;
  final List<Decision> otherCourtDocs;
  final List<Citation> citations;
  final List<VaultDocument> vaultDocuments;

  const EvidenceState({
    this.decisions = const [],
    this.otherCourtDocs = const [],
    this.citations = const [],
    this.vaultDocuments = const [],
  });

  bool get hasAny =>
      decisions.isNotEmpty ||
      otherCourtDocs.isNotEmpty ||
      citations.isNotEmpty ||
      vaultDocuments.isNotEmpty;

  int get totalCount =>
      decisions.length +
      otherCourtDocs.length +
      citations.length +
      vaultDocuments.length;
}

class PendingPlanReview {
  final ExecutionPlan plan;
  final String planSessionId;
  final String query;
  final String assistantMessageId;

  const PendingPlanReview({
    required this.plan,
    required this.planSessionId,
    required this.query,
    required this.assistantMessageId,
  });
}
