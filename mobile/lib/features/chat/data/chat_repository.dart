import 'dart:async';
import '../../../core/network/api_client.dart';
import '../../../core/network/sse_client.dart';
import 'models/message.dart';
import 'models/chat_event.dart';

class ChatRepository {
  final ApiClient _api;
  final SSEClient _sse;

  ChatRepository({required ApiClient api, required SSEClient sse})
      : _api = api,
        _sse = sse;

  /// Stream chat via SSE. Returns a subscription that can be cancelled.
  Future<StreamSubscription?> streamChat({
    required String query,
    required List<Message> history,
    String budget = 'standard',
    String? conversationId,
    ExecutionPlan? approvedPlan,
    required void Function(ChatEvent event) onEvent,
    required void Function() onDone,
    required void Function(dynamic error) onError,
  }) {
    final body = {
      'query': query,
      'history': history.map((m) => m.toJson()).toList(),
      'budget': budget,
      if (conversationId != null) 'conversationId': conversationId,
      if (approvedPlan != null) 'approvedPlan': {
        'goal': approvedPlan.goal,
        'steps': approvedPlan.steps
            .map((s) => {
                  'id': s.id,
                  'tool': s.tool,
                  'params': s.params,
                  'purpose': s.purpose,
                })
            .toList(),
        'expected_iterations': approvedPlan.expectedIterations,
      },
    };

    return _sse.stream(
      path: '/api/chat',
      body: body,
      onEvent: (sseEvent) {
        final chatEvent = ChatEvent.fromSSE(sseEvent.event, sseEvent.data);
        onEvent(chatEvent);
      },
      onDone: onDone,
      onError: onError,
    );
  }

  // Conversations CRUD

  Future<List<Conversation>> getConversations({
    int limit = 50,
    int offset = 0,
  }) async {
    final response = await _api.get('/api/conversations', queryParameters: {
      'limit': limit,
      'offset': offset,
    });
    final list = response.data as List? ?? [];
    return list
        .map((e) => Conversation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Conversation> getConversation(String id) async {
    final response = await _api.get('/api/conversations/$id');
    return Conversation.fromJson(response.data as Map<String, dynamic>);
  }

  Future<Conversation> createConversation({String? title}) async {
    final response = await _api.post('/api/conversations', data: {
      if (title != null) 'title': title,
    });
    return Conversation.fromJson(response.data as Map<String, dynamic>);
  }

  Future<void> deleteConversation(String id) async {
    await _api.delete('/api/conversations/$id');
  }

  Future<void> renameConversation(String id, String title) async {
    await _api.put('/api/conversations/$id', data: {'title': title});
  }

  Future<void> addMessage(String conversationId, Message message) async {
    await _api.post('/api/conversations/$conversationId/messages', data: {
      'role': message.role,
      'content': message.content,
      if (message.thinkingSteps.isNotEmpty) 'thinking_steps': message.thinkingSteps
          .map((s) => {'id': s.id, 'title': s.title, 'content': s.content})
          .toList(),
      if (message.decisions.isNotEmpty) 'decisions': message.decisions
          .map((d) => {
                'id': d.id,
                'number': d.number,
                'court': d.court,
                'date': d.date,
                'summary': d.summary,
              })
          .toList(),
    });
  }
}
