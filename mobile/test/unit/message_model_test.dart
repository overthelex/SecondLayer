import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/chat/data/models/message.dart';

void main() {
  group('Message', () {
    test('creates from JSON', () {
      final msg = Message.fromJson({
        'id': 'msg-1',
        'role': 'assistant',
        'content': 'Hello',
        'created_at': '2026-01-01T00:00:00Z',
      });
      expect(msg.id, 'msg-1');
      expect(msg.role, 'assistant');
      expect(msg.content, 'Hello');
    });

    test('toJson returns role and content', () {
      const msg = Message(id: '1', role: 'user', content: 'test');
      final json = msg.toJson();
      expect(json['role'], 'user');
      expect(json['content'], 'test');
    });

    test('copyWith updates content and preserves other fields', () {
      const msg = Message(id: '1', role: 'user', content: 'original');
      final updated = msg.copyWith(content: 'updated');
      expect(updated.content, 'updated');
      expect(updated.id, '1');
      expect(updated.role, 'user');
    });

    test('handles missing fields in JSON', () {
      final msg = Message.fromJson(<String, dynamic>{});
      expect(msg.id, '');
      expect(msg.role, 'assistant');
      expect(msg.content, '');
    });
  });

  group('Conversation', () {
    test('creates from JSON with messages', () {
      final conv = Conversation.fromJson({
        'id': 'conv-1',
        'title': 'Test conversation',
        'created_at': '2026-01-01T00:00:00Z',
        'updated_at': '2026-01-01T01:00:00Z',
        'messages': [
          {'id': 'm1', 'role': 'user', 'content': 'hello'},
          {'id': 'm2', 'role': 'assistant', 'content': 'hi'},
        ],
      });
      expect(conv.id, 'conv-1');
      expect(conv.title, 'Test conversation');
      expect(conv.messages.length, 2);
      expect(conv.messages[0].role, 'user');
    });

    test('handles empty messages list', () {
      final conv = Conversation.fromJson({
        'id': 'c1',
        'title': 'Empty',
        'created_at': '2026-01-01T00:00:00Z',
        'updated_at': '2026-01-01T00:00:00Z',
      });
      expect(conv.messages, isEmpty);
    });
  });

  group('ThinkingStep', () {
    test('creates from JSON with tool name', () {
      final step = ThinkingStep.fromJson({
        'id': '1',
        'tool': 'search_court_decisions',
        'description': 'Searching...',
        'cost_usd': 0.003,
      });
      expect(step.title, 'search_court_decisions');
      expect(step.content, 'Searching...');
      expect(step.costUsd, 0.003);
    });
  });

  group('CostSummary', () {
    test('creates from JSON', () {
      final cost = CostSummary.fromJson({
        'tools_used': ['tool1', 'tool2'],
        'total_cost_usd': 0.05,
        'charged_usd': 0.04,
        'balance_usd': 10.0,
      });
      expect(cost.toolsUsed, ['tool1', 'tool2']);
      expect(cost.totalCostUsd, 0.05);
      expect(cost.chargedUsd, 0.04);
      expect(cost.balanceUsd, 10.0);
    });
  });

}
