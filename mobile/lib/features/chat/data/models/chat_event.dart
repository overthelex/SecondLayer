import 'message.dart';

double? _toDouble(dynamic v) {
  if (v == null) return null;
  if (v is num) return v.toDouble();
  if (v is String) return double.tryParse(v);
  return null;
}

/// Represents the different SSE events from /api/chat.
/// Maps to the backend chat-service.ts SSE event contract.
sealed class ChatEvent {
  const ChatEvent();

  factory ChatEvent.fromSSE(String eventType, dynamic data) {
    final json = data is Map<String, dynamic> ? data : <String, dynamic>{};

    return switch (eventType) {
      'response_id' => ResponseIdEvent(
          responseId: json['response_id'] as String? ?? ''),
      'plan' => PlanEvent(plan: ExecutionPlan.fromJson(json)),
      'thinking' => ThinkingEvent(
          step: json['step'] as int? ?? 0,
          tool: json['tool'] as String? ?? '',
          description: json['description'] as String?,
          costUsd: (json['cost_usd'] as num?)?.toDouble(),
        ),
      'tool_result' => ToolResultEvent(
          tool: json['tool'] as String? ?? '',
          result: json['result'],
          costUsd: (json['cost_usd'] as num?)?.toDouble(),
        ),
      'answer_delta' => AnswerDeltaEvent(
          text: json['text'] as String? ?? ''),
      'answer' => AnswerEvent(
          text: json['text'] as String? ?? '',
          provider: json['provider'] as String?,
          model: json['model'] as String?,
        ),
      'citation_warning' => CitationWarningEvent(data: json),
      'complete' => CompleteEvent(
          iterations: json['iterations'] as int? ?? 0,
          elapsedMs: json['elapsed_ms'] as int? ?? 0,
          toolsUsed: (json['tools_used'] as List?)
                  ?.map((e) => e as String)
                  .toList() ??
              [],
          totalCostUsd: _toDouble(json['total_cost_usd']) ?? 0,
          chargedUsd: _toDouble(json['charged_usd']),
          conversationId: json['conversationId'] as String?,
        ),
      'cost_summary' => CostSummaryEvent(
          summary: CostSummary.fromJson(json)),
      'budget_escalated' => BudgetEscalatedEvent(
          reason: json['reason'] as String? ?? ''),
      'error' => ErrorEvent(
          message: json['message'] as String? ?? 'Невідома помилка'),
      _ => UnknownEvent(eventType: eventType, data: json),
    };
  }
}

class ResponseIdEvent extends ChatEvent {
  final String responseId;
  const ResponseIdEvent({required this.responseId});
}

class PlanEvent extends ChatEvent {
  final ExecutionPlan plan;
  const PlanEvent({required this.plan});
}

class ThinkingEvent extends ChatEvent {
  final int step;
  final String tool;
  final String? description;
  final double? costUsd;
  const ThinkingEvent({
    required this.step,
    required this.tool,
    this.description,
    this.costUsd,
  });
}

class ToolResultEvent extends ChatEvent {
  final String tool;
  final dynamic result;
  final double? costUsd;
  const ToolResultEvent({
    required this.tool,
    this.result,
    this.costUsd,
  });
}

class AnswerDeltaEvent extends ChatEvent {
  final String text;
  const AnswerDeltaEvent({required this.text});
}

class AnswerEvent extends ChatEvent {
  final String text;
  final String? provider;
  final String? model;
  const AnswerEvent({required this.text, this.provider, this.model});
}

class CitationWarningEvent extends ChatEvent {
  final Map<String, dynamic> data;
  const CitationWarningEvent({required this.data});
}

class CompleteEvent extends ChatEvent {
  final int iterations;
  final int elapsedMs;
  final List<String> toolsUsed;
  final double totalCostUsd;
  final double? chargedUsd;
  final String? conversationId;
  const CompleteEvent({
    required this.iterations,
    required this.elapsedMs,
    this.toolsUsed = const [],
    this.totalCostUsd = 0,
    this.chargedUsd,
    this.conversationId,
  });
}

class CostSummaryEvent extends ChatEvent {
  final CostSummary summary;
  const CostSummaryEvent({required this.summary});
}

class BudgetEscalatedEvent extends ChatEvent {
  final String reason;
  const BudgetEscalatedEvent({required this.reason});
}

class ErrorEvent extends ChatEvent {
  final String message;
  const ErrorEvent({required this.message});
}

class UnknownEvent extends ChatEvent {
  final String eventType;
  final Map<String, dynamic> data;
  const UnknownEvent({required this.eventType, required this.data});
}
