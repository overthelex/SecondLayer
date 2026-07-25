import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/chat/data/models/chat_event.dart';

void main() {
  group('ChatEvent.fromSSE', () {
    test('parses answer_delta event', () {
      final event = ChatEvent.fromSSE('answer_delta', {'text': 'Hello'});
      expect(event, isA<AnswerDeltaEvent>());
      expect((event as AnswerDeltaEvent).text, 'Hello');
    });

    test('parses answer event with provider', () {
      final event = ChatEvent.fromSSE('answer', {
        'text': 'Full answer',
        'provider': 'openai',
        'model': 'gpt-4o',
      });
      expect(event, isA<AnswerEvent>());
      final answer = event as AnswerEvent;
      expect(answer.text, 'Full answer');
      expect(answer.provider, 'openai');
      expect(answer.model, 'gpt-4o');
    });

    test('parses plan event', () {
      final event = ChatEvent.fromSSE('plan', {
        'goal': 'Find cases',
        'steps': [
          {'id': 1, 'tool': 'search', 'params': {}, 'purpose': 'search cases'},
        ],
        'expected_iterations': 2,
      });
      expect(event, isA<PlanEvent>());
      final plan = (event as PlanEvent).plan;
      expect(plan.goal, 'Find cases');
      expect(plan.steps.length, 1);
      expect(plan.steps[0].tool, 'search');
      expect(plan.expectedIterations, 2);
    });

    test('parses thinking event', () {
      final event = ChatEvent.fromSSE('thinking', {
        'step': 1,
        'tool': 'search_court_decisions',
        'description': 'Searching...',
        'cost_usd': 0.001,
      });
      expect(event, isA<ThinkingEvent>());
      final thinking = event as ThinkingEvent;
      expect(thinking.step, 1);
      expect(thinking.tool, 'search_court_decisions');
      expect(thinking.costUsd, 0.001);
    });

    test('parses complete event', () {
      final event = ChatEvent.fromSSE('complete', {
        'iterations': 3,
        'elapsed_ms': 5000,
        'tools_used': ['search', 'get_document'],
        'total_cost_usd': 0.05,
        'charged_usd': 0.04,
        'conversationId': 'conv-123',
      });
      expect(event, isA<CompleteEvent>());
      final complete = event as CompleteEvent;
      expect(complete.iterations, 3);
      expect(complete.elapsedMs, 5000);
      expect(complete.toolsUsed, ['search', 'get_document']);
      expect(complete.totalCostUsd, 0.05);
      expect(complete.conversationId, 'conv-123');
    });

    test('parses error event', () {
      final event = ChatEvent.fromSSE('error', {'message': 'Rate limited'});
      expect(event, isA<ErrorEvent>());
      expect((event as ErrorEvent).message, 'Rate limited');
    });

    test('parses cost_summary event', () {
      final event = ChatEvent.fromSSE('cost_summary', {
        'total_cost_usd': 0.1,
        'charged_usd': 0.08,
        'balance_usd': 4.50,
        'tools_used': ['search'],
      });
      expect(event, isA<CostSummaryEvent>());
      final summary = (event as CostSummaryEvent).summary;
      expect(summary.totalCostUsd, 0.1);
      expect(summary.chargedUsd, 0.08);
      expect(summary.balanceUsd, 4.50);
    });

    test('parses response_id event', () {
      final event =
          ChatEvent.fromSSE('response_id', {'response_id': 'resp-abc'});
      expect(event, isA<ResponseIdEvent>());
      expect((event as ResponseIdEvent).responseId, 'resp-abc');
    });

    test('returns UnknownEvent for unrecognized type', () {
      final event = ChatEvent.fromSSE('new_event_type', {'key': 'value'});
      expect(event, isA<UnknownEvent>());
      expect((event as UnknownEvent).eventType, 'new_event_type');
    });

    test('handles null/missing fields gracefully', () {
      final event = ChatEvent.fromSSE('complete', <String, dynamic>{});
      expect(event, isA<CompleteEvent>());
      final complete = event as CompleteEvent;
      expect(complete.iterations, 0);
      expect(complete.elapsedMs, 0);
      expect(complete.toolsUsed, isEmpty);
    });
  });
}
