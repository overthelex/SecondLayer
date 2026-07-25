import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
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
      if (approvedPlan != null)
        'approvedPlan': {
          'goal': approvedPlan.goal,
          'steps': approvedPlan.steps
              .map((s) => {
                    'id': s.id,
                    'tool': s.tool,
                    'params': s.params,
                    'purpose': s.purpose,
                    if (s.depth != null) 'depth': s.depth,
                    if (s.dependsOn != null) 'depends_on': s.dependsOn,
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

  /// Request a plan without execution
  Future<Map<String, dynamic>> requestPlan(
      String query, String budget) async {
    final response = await _api.post('/api/chat/plan', data: {
      'query': query,
      'budget': budget,
    });
    return response.data as Map<String, dynamic>;
  }

  /// Upload a file
  Future<Map<String, dynamic>> uploadFile(
    File file, {
    void Function(int, int)? onProgress,
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path,
          filename: file.path.split('/').last),
    });

    final response = await _api.dio.post(
      '/api/documents/upload',
      data: formData,
      onSendProgress: onProgress,
    );
    return response.data as Map<String, dynamic>;
  }

  /// Call a specific tool directly
  Future<Map<String, dynamic>> callTool(
    String toolName,
    Map<String, dynamic> params,
  ) async {
    final response = await _api.post('/api/tools/$toolName', data: params);
    return response.data as Map<String, dynamic>;
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
      if (message.thinkingSteps.isNotEmpty)
        'thinking_steps': message.thinkingSteps
            .map((s) => {'id': s.id, 'title': s.title, 'content': s.content})
            .toList(),
      if (message.decisions.isNotEmpty)
        'decisions': message.decisions
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
