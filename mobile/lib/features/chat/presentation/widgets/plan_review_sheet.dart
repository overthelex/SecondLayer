import 'package:flutter/material.dart';
import '../../data/models/message.dart';
import '../../../../shared/theme/app_colors.dart';

class PlanReviewSheet extends StatefulWidget {
  final ExecutionPlan plan;
  final String query;
  final VoidCallback onConfirm;
  final VoidCallback onSkip;
  final VoidCallback onCancel;
  final ValueChanged<ExecutionPlan> onPlanChanged;

  const PlanReviewSheet({
    super.key,
    required this.plan,
    required this.query,
    required this.onConfirm,
    required this.onSkip,
    required this.onCancel,
    required this.onPlanChanged,
  });

  @override
  State<PlanReviewSheet> createState() => _PlanReviewSheetState();
}

class _PlanReviewSheetState extends State<PlanReviewSheet> {
  late ExecutionPlan _plan;

  @override
  void initState() {
    super.initState();
    _plan = widget.plan;
  }

  void _toggleStepDepth(int stepIndex) {
    final steps = List<PlanStep>.from(_plan.steps);
    final step = steps[stepIndex];
    final newDepth = step.depth == 'deep' ? 'standard' : 'deep';
    steps[stepIndex] = step.copyWith(depth: newDepth);
    setState(() {
      _plan = ExecutionPlan(
        goal: _plan.goal,
        steps: steps,
        expectedIterations: _plan.expectedIterations,
      );
    });
    widget.onPlanChanged(_plan);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.75,
      ),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 8, bottom: 4),
              width: 32,
              height: 4,
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'План виконання',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  _plan.goal,
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurfaceVariant,
                  ),
                ),
              ],
            ),
          ),

          const Divider(height: 1),

          // Steps
          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              padding: const EdgeInsets.symmetric(vertical: 8),
              itemCount: _plan.steps.length,
              itemBuilder: (_, index) {
                final step = _plan.steps[index];
                return ListTile(
                  leading: CircleAvatar(
                    radius: 14,
                    backgroundColor: AppColors.primary.withValues(alpha: 0.12),
                    child: Text(
                      '${index + 1}',
                      style: const TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.primary,
                      ),
                    ),
                  ),
                  title: Text(
                    step.purpose,
                    style: theme.textTheme.bodyMedium,
                  ),
                  subtitle: Text(
                    step.tool,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: theme.colorScheme.onSurfaceVariant,
                    ),
                  ),
                  trailing: _DepthToggle(
                    depth: step.depth ?? 'standard',
                    onToggle: () => _toggleStepDepth(index),
                  ),
                );
              },
            ),
          ),

          const Divider(height: 1),

          // Actions
          Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: OutlinedButton(
                    onPressed: widget.onSkip,
                    style: OutlinedButton.styleFrom(
                      side: BorderSide(color: AppColors.border),
                    ),
                    child: const Text('Пропустити'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: ElevatedButton(
                    onPressed: widget.onConfirm,
                    child: const Text('Виконати'),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _DepthToggle extends StatelessWidget {
  final String depth;
  final VoidCallback onToggle;

  const _DepthToggle({required this.depth, required this.onToggle});

  @override
  Widget build(BuildContext context) {
    final isDeep = depth == 'deep';

    return GestureDetector(
      onTap: onToggle,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        decoration: BoxDecoration(
          color: isDeep
              ? AppColors.primary.withValues(alpha: 0.12)
              : AppColors.surfaceVariant,
          borderRadius: BorderRadius.circular(12),
        ),
        child: Text(
          isDeep ? 'Глибоко' : 'Стандарт',
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w500,
            color: isDeep ? AppColors.primary : AppColors.textSecondary,
          ),
        ),
      ),
    );
  }
}
