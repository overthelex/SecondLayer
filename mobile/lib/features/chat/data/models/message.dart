class Message {
  final String id;
  final String role; // 'user' | 'assistant'
  final String content;
  final bool isStreaming;
  final List<ThinkingStep> thinkingSteps;
  final ExecutionPlan? executionPlan;
  final List<Decision> decisions;
  final CostSummary? costSummary;
  final DateTime createdAt;

  const Message({
    required this.id,
    required this.role,
    required this.content,
    this.isStreaming = false,
    this.thinkingSteps = const [],
    this.executionPlan,
    this.decisions = const [],
    this.costSummary,
    DateTime? createdAt,
  }) : createdAt = createdAt ?? const _Now();

  Message copyWith({
    String? content,
    bool? isStreaming,
    List<ThinkingStep>? thinkingSteps,
    ExecutionPlan? executionPlan,
    List<Decision>? decisions,
    CostSummary? costSummary,
  }) =>
      Message(
        id: id,
        role: role,
        content: content ?? this.content,
        isStreaming: isStreaming ?? this.isStreaming,
        thinkingSteps: thinkingSteps ?? this.thinkingSteps,
        executionPlan: executionPlan ?? this.executionPlan,
        decisions: decisions ?? this.decisions,
        costSummary: costSummary ?? this.costSummary,
        createdAt: createdAt,
      );

  factory Message.fromJson(Map<String, dynamic> json) => Message(
        id: json['id'] as String? ?? '',
        role: json['role'] as String? ?? 'assistant',
        content: json['content'] as String? ?? '',
        thinkingSteps: (json['thinking_steps'] as List?)
                ?.map((e) => ThinkingStep.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        decisions: (json['decisions'] as List?)
                ?.map((e) => Decision.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        createdAt: json['created_at'] != null
            ? DateTime.parse(json['created_at'] as String)
            : DateTime.now(),
      );

  Map<String, dynamic> toJson() => {
        'role': role,
        'content': content,
      };
}

// Helper for const default DateTime
class _Now implements DateTime {
  const _Now();
  @override
  dynamic noSuchMethod(Invocation invocation) => DateTime.now().noSuchMethod(invocation);
}

class ThinkingStep {
  final String id;
  final String title;
  final String content;
  final bool isComplete;
  final double? costUsd;

  const ThinkingStep({
    required this.id,
    required this.title,
    this.content = '',
    this.isComplete = false,
    this.costUsd,
  });

  ThinkingStep copyWith({String? content, bool? isComplete}) => ThinkingStep(
        id: id,
        title: title,
        content: content ?? this.content,
        isComplete: isComplete ?? this.isComplete,
        costUsd: costUsd,
      );

  factory ThinkingStep.fromJson(Map<String, dynamic> json) => ThinkingStep(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? json['tool'] as String? ?? '',
        content: json['content'] as String? ??
            json['description'] as String? ??
            '',
        isComplete: json['isComplete'] as bool? ?? true,
        costUsd: (json['cost_usd'] as num?)?.toDouble(),
      );
}

class ExecutionPlan {
  final String goal;
  final List<PlanStep> steps;
  final int expectedIterations;

  const ExecutionPlan({
    required this.goal,
    required this.steps,
    this.expectedIterations = 1,
  });

  factory ExecutionPlan.fromJson(Map<String, dynamic> json) => ExecutionPlan(
        goal: json['goal'] as String? ?? '',
        steps: (json['steps'] as List?)
                ?.map((e) => PlanStep.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
        expectedIterations: json['expected_iterations'] as int? ?? 1,
      );
}

class PlanStep {
  final int id;
  final String tool;
  final Map<String, dynamic> params;
  final String purpose;
  final bool completed;

  const PlanStep({
    required this.id,
    required this.tool,
    this.params = const {},
    required this.purpose,
    this.completed = false,
  });

  PlanStep copyWith({bool? completed}) => PlanStep(
        id: id,
        tool: tool,
        params: params,
        purpose: purpose,
        completed: completed ?? this.completed,
      );

  factory PlanStep.fromJson(Map<String, dynamic> json) => PlanStep(
        id: json['id'] as int? ?? 0,
        tool: json['tool'] as String? ?? '',
        params: (json['params'] as Map?)?.cast<String, dynamic>() ?? {},
        purpose: json['purpose'] as String? ?? '',
        completed: json['completed'] as bool? ?? false,
      );
}

class Decision {
  final String id;
  final String number;
  final String court;
  final String date;
  final String summary;
  final double relevance;
  final String? docId;

  const Decision({
    required this.id,
    required this.number,
    required this.court,
    required this.date,
    required this.summary,
    this.relevance = 0,
    this.docId,
  });

  factory Decision.fromJson(Map<String, dynamic> json) => Decision(
        id: json['id'] as String? ?? '',
        number: json['number'] as String? ?? '',
        court: json['court'] as String? ?? '',
        date: json['date'] as String? ?? '',
        summary: json['summary'] as String? ?? '',
        relevance: (json['relevance'] as num?)?.toDouble() ?? 0,
        docId: json['docId'] as String?,
      );
}

class CostSummary {
  final List<String> toolsUsed;
  final double totalCostUsd;
  final double? chargedUsd;
  final double? balanceUsd;

  const CostSummary({
    this.toolsUsed = const [],
    this.totalCostUsd = 0,
    this.chargedUsd,
    this.balanceUsd,
  });

  factory CostSummary.fromJson(Map<String, dynamic> json) => CostSummary(
        toolsUsed: (json['tools_used'] as List?)
                ?.map((e) => e as String)
                .toList() ??
            [],
        totalCostUsd: (json['total_cost_usd'] as num?)?.toDouble() ?? 0,
        chargedUsd: (json['charged_usd'] as num?)?.toDouble(),
        balanceUsd: (json['balance_usd'] as num?)?.toDouble(),
      );
}

class Conversation {
  final String id;
  final String title;
  final DateTime createdAt;
  final DateTime updatedAt;
  final List<Message> messages;

  const Conversation({
    required this.id,
    required this.title,
    required this.createdAt,
    required this.updatedAt,
    this.messages = const [],
  });

  factory Conversation.fromJson(Map<String, dynamic> json) => Conversation(
        id: json['id'] as String? ?? '',
        title: json['title'] as String? ?? 'Нова розмова',
        createdAt: DateTime.parse(
            json['created_at'] as String? ?? DateTime.now().toIso8601String()),
        updatedAt: DateTime.parse(
            json['updated_at'] as String? ?? DateTime.now().toIso8601String()),
        messages: (json['messages'] as List?)
                ?.map((e) => Message.fromJson(e as Map<String, dynamic>))
                .toList() ??
            [],
      );
}
