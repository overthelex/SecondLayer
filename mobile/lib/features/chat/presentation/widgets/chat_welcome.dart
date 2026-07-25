import 'package:flutter/material.dart';
import '../../../../shared/theme/app_colors.dart';

/// Chat "welcome" empty state — screen "01 Чат — привітання".
///
/// Distinct from the shared [EmptyState] widget (used by other screens):
/// this renders a serif title, a constrained subtitle and three tappable
/// suggestion cards that pre-fill / send a starter prompt.
class ChatWelcome extends StatelessWidget {
  /// Called when a suggestion card is tapped, with its prompt text.
  final void Function(String prompt) onSuggestionTap;

  const ChatWelcome({super.key, required this.onSuggestionTap});

  static const _suggestions = <_Suggestion>[
    _Suggestion(
      label: 'Швидкий пошук',
      prompt: 'Інформація про депутата Стефанчук Руслан',
    ),
    _Suggestion(
      label: 'Дослідження',
      prompt:
          'Семантичний пошук: відповідальність директора за борги ТОВ + відповідні норми ЦК',
    ),
    _Suggestion(
      label: 'Глибокий аналіз',
      prompt:
          'Повний аналіз поручительства: норми ЦК, практика ВС, ЄСПЛ, патерни аргументації та процесуальний чеклист',
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            // Title — Crimson Pro serif
            Text(
              'Чим можу допомогти?',
              textAlign: TextAlign.center,
              style: theme.textTheme.headlineLarge,
            ),
            const SizedBox(height: 12),

            // Subtitle — body small, secondary, constrained width
            ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 280),
              child: Text(
                'AI-асистент для роботи з українським правом — аналіз судової '
                'практики, підготовка документів та правові консультації.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                ),
              ),
            ),
            const SizedBox(height: 28),

            // Suggestion cards
            for (var i = 0; i < _suggestions.length; i++) ...[
              if (i > 0) const SizedBox(height: 9),
              _SuggestionCard(
                suggestion: _suggestions[i],
                onTap: () => onSuggestionTap(_suggestions[i].prompt),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _Suggestion {
  final String label;
  final String prompt;
  const _Suggestion({required this.label, required this.prompt});
}

class _SuggestionCard extends StatelessWidget {
  final _Suggestion suggestion;
  final VoidCallback onTap;

  const _SuggestionCard({required this.suggestion, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return ConstrainedBox(
      constraints: const BoxConstraints(maxWidth: 420),
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(13),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(13),
          child: Container(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(13),
              border: Border.all(color: AppColors.border),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 15, vertical: 13),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        suggestion.label.toUpperCase(),
                        style: const TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textTertiary,
                          letterSpacing: 0.6,
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        suggestion.prompt,
                        style: const TextStyle(
                          fontSize: 13,
                          height: 1.4,
                          color: AppColors.zinc700,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 12),
                const Padding(
                  padding: EdgeInsets.only(top: 2),
                  child: Icon(
                    Icons.arrow_right_alt,
                    size: 18,
                    color: AppColors.zinc300,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
