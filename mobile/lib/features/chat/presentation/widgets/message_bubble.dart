import 'package:flutter/material.dart';
import '../../data/models/message.dart';
import '../../../../shared/theme/app_colors.dart';
import 'legal_markdown.dart';
import 'message_actions.dart';
import 'citation_warnings_strip.dart';

class MessageBubble extends StatefulWidget {
  final Message message;
  final bool isLastAssistant;
  final VoidCallback? onRegenerate;
  final void Function(String messageId, String newContent)? onEdit;

  const MessageBubble({
    super.key,
    required this.message,
    this.isLastAssistant = false,
    this.onRegenerate,
    this.onEdit,
  });

  @override
  State<MessageBubble> createState() => _MessageBubbleState();
}

class _MessageBubbleState extends State<MessageBubble> {
  bool _isEditing = false;
  late TextEditingController _editController;

  bool get _isUser => widget.message.role == 'user';

  @override
  void initState() {
    super.initState();
    _editController = TextEditingController(text: widget.message.content);
  }

  @override
  void dispose() {
    _editController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      child: Column(
        crossAxisAlignment:
            _isUser ? CrossAxisAlignment.end : CrossAxisAlignment.start,
        children: [
          // Thinking steps (collapsible)
          if (widget.message.thinkingSteps.isNotEmpty && !_isUser)
            _ThinkingStepsWidget(steps: widget.message.thinkingSteps),

          // Execution plan
          if (widget.message.executionPlan != null && !_isUser)
            _ExecutionPlanWidget(plan: widget.message.executionPlan!),

          // Message row with optional avatar
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment:
                _isUser ? MainAxisAlignment.end : MainAxisAlignment.start,
            children: [
              // Assistant avatar
              if (!_isUser) ...[
                Container(
                  width: 28,
                  height: 28,
                  margin: const EdgeInsets.only(right: 8, top: 2),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: const Icon(
                    Icons.balance,
                    size: 16,
                    color: AppColors.primary,
                  ),
                ),
              ],

              // Bubble
              Flexible(
                child: Container(
                  constraints: BoxConstraints(
                    maxWidth: MediaQuery.of(context).size.width * 0.78,
                  ),
                  padding:
                      const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: _isUser
                        ? (isDark
                            ? AppColors.darkUserBubble
                            : AppColors.userBubble)
                        : (isDark
                            ? AppColors.darkAssistantBubble
                            : AppColors.assistantBubble),
                    borderRadius: BorderRadius.only(
                      topLeft: const Radius.circular(16),
                      topRight: const Radius.circular(16),
                      bottomLeft: Radius.circular(_isUser ? 16 : 4),
                      bottomRight: Radius.circular(_isUser ? 4 : 16),
                    ),
                    border: _isUser
                        ? null
                        : Border.all(
                            color: isDark
                                ? AppColors.darkBorder
                                : AppColors.border,
                          ),
                  ),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // Editing mode
                      if (_isEditing)
                        _buildEditField(theme)
                      // User message
                      else if (_isUser)
                        Text(
                          widget.message.content,
                          // User bubble is ink (near-black) in both light
                          // (userBubble) and dark (darkUserBubble) themes, so
                          // text is always white for contrast.
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: AppColors.textOnPrimary,
                          ),
                        )
                      // Streaming indicator
                      else if (widget.message.content.isEmpty &&
                          widget.message.isStreaming)
                        _StreamingIndicator()
                      // Assistant message with legal markdown
                      else
                        LegalMarkdownBody(data: widget.message.content),

                      // Citation warnings
                      if (widget.message.citationWarnings.isNotEmpty &&
                          !_isUser) ...[
                        const SizedBox(height: 8),
                        CitationWarningsStrip(
                          warnings: widget.message.citationWarnings,
                        ),
                      ],

                      // Cost summary
                      if (widget.message.costSummary != null && !_isUser)
                        Padding(
                          padding: const EdgeInsets.only(top: 8),
                          child: Text(
                            '\$${widget.message.costSummary!.totalCostUsd.toStringAsFixed(4)}',
                            style: theme.textTheme.labelSmall?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
            ],
          ),

          // Message actions
          if (!widget.message.isStreaming && widget.message.content.isNotEmpty)
            Padding(
              padding: EdgeInsets.only(
                left: _isUser ? 0 : 36,
                top: 2,
              ),
              child: MessageActions(
                role: widget.message.role,
                content: widget.message.content,
                isLastAssistant: widget.isLastAssistant,
                onRegenerate: widget.onRegenerate,
                onEdit: _isUser
                    ? () => setState(() => _isEditing = true)
                    : null,
              ),
            ),
        ],
      ),
    );
  }

  Widget _buildEditField(ThemeData theme) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        TextField(
          controller: _editController,
          maxLines: null,
          autofocus: true,
          decoration: InputDecoration(
            border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
            contentPadding:
                const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          ),
        ),
        const SizedBox(height: 8),
        Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            TextButton(
              onPressed: () => setState(() => _isEditing = false),
              child: const Text('Скасувати'),
            ),
            const SizedBox(width: 8),
            ElevatedButton(
              onPressed: () {
                final text = _editController.text.trim();
                if (text.isNotEmpty) {
                  widget.onEdit?.call(widget.message.id, text);
                }
                setState(() => _isEditing = false);
              },
              child: const Text('Надіслати'),
            ),
          ],
        ),
      ],
    );
  }
}

class _StreamingIndicator extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return const SizedBox(
      height: 20,
      width: 40,
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          _Dot(delay: 0),
          SizedBox(width: 4),
          _Dot(delay: 200),
          SizedBox(width: 4),
          _Dot(delay: 400),
        ],
      ),
    );
  }
}

class _Dot extends StatefulWidget {
  final int delay;
  const _Dot({required this.delay});

  @override
  State<_Dot> createState() => _DotState();
}

class _DotState extends State<_Dot> with SingleTickerProviderStateMixin {
  late final AnimationController _controller;
  late final Animation<double> _animation;

  @override
  void initState() {
    super.initState();
    _controller = AnimationController(
      duration: const Duration(milliseconds: 600),
      vsync: this,
    );
    _animation = Tween<double>(begin: 0.3, end: 1.0).animate(_controller);

    Future.delayed(Duration(milliseconds: widget.delay), () {
      if (mounted) _controller.repeat(reverse: true);
    });
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return FadeTransition(
      opacity: _animation,
      child: Container(
        width: 8,
        height: 8,
        decoration: BoxDecoration(
          color: AppColors.primary,
          shape: BoxShape.circle,
        ),
      ),
    );
  }
}

class _ThinkingStepsWidget extends StatefulWidget {
  final List<ThinkingStep> steps;
  const _ThinkingStepsWidget({required this.steps});

  @override
  State<_ThinkingStepsWidget> createState() => _ThinkingStepsWidgetState();
}

class _ThinkingStepsWidgetState extends State<_ThinkingStepsWidget> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8, left: 36),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: theme.colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: theme.colorScheme.outline.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          GestureDetector(
            onTap: () => setState(() => _expanded = !_expanded),
            child: Row(
              children: [
                Icon(Icons.psychology,
                    size: 16, color: theme.colorScheme.primary),
                const SizedBox(width: 8),
                Text('Аналіз (${widget.steps.length})',
                    style: theme.textTheme.labelLarge),
                const Spacer(),
                AnimatedRotation(
                  turns: _expanded ? 0.5 : 0,
                  duration: const Duration(milliseconds: 200),
                  child: Icon(Icons.expand_more,
                      size: 18, color: theme.colorScheme.onSurfaceVariant),
                ),
              ],
            ),
          ),
          if (_expanded) ...[
            const SizedBox(height: 8),
            ...widget.steps.map((step) => Padding(
                  padding: const EdgeInsets.symmetric(vertical: 2),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Icon(
                        step.isComplete
                            ? Icons.check_circle
                            : Icons.hourglass_top,
                        size: 14,
                        color: step.isComplete
                            ? AppColors.success
                            : theme.colorScheme.primary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(step.title,
                            style: theme.textTheme.bodySmall),
                      ),
                    ],
                  ),
                )),
          ],
        ],
      ),
    );
  }
}

class _ExecutionPlanWidget extends StatelessWidget {
  final ExecutionPlan plan;
  const _ExecutionPlanWidget({required this.plan});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Container(
      margin: const EdgeInsets.only(bottom: 8, left: 36),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: AppColors.primary.withValues(alpha: 0.06),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(
          color: AppColors.primary.withValues(alpha: 0.2),
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Icon(Icons.route, size: 16, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(plan.goal, style: theme.textTheme.labelLarge),
              ),
            ],
          ),
          const SizedBox(height: 8),
          ...plan.steps.map((step) => Padding(
                padding: const EdgeInsets.symmetric(vertical: 2),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Icon(
                      step.completed
                          ? Icons.check_circle
                          : Icons.radio_button_unchecked,
                      size: 14,
                      color: step.completed
                          ? AppColors.success
                          : theme.colorScheme.onSurfaceVariant,
                    ),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(
                        '${step.tool}: ${step.purpose}',
                        style: theme.textTheme.bodySmall,
                      ),
                    ),
                  ],
                ),
              )),
        ],
      ),
    );
  }
}
