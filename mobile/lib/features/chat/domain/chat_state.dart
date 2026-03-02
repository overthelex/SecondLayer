import '../data/models/message.dart';

class ChatState {
  final List<Message> messages;
  final bool isStreaming;
  final String? error;
  final String? conversationId;
  final String budget; // 'quick' | 'standard' | 'deep'
  final List<Conversation> conversations;
  final bool isLoadingConversations;

  const ChatState({
    this.messages = const [],
    this.isStreaming = false,
    this.error,
    this.conversationId,
    this.budget = 'standard',
    this.conversations = const [],
    this.isLoadingConversations = false,
  });

  ChatState copyWith({
    List<Message>? messages,
    bool? isStreaming,
    String? error,
    String? conversationId,
    String? budget,
    List<Conversation>? conversations,
    bool? isLoadingConversations,
    bool clearError = false,
    bool clearConversation = false,
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
      );
}
