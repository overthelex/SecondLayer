import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../../../shared/theme/app_colors.dart';

/// Custom markdown renderer with legal highlighting.
class LegalMarkdownBody extends StatelessWidget {
  final String data;
  final bool selectable;

  const LegalMarkdownBody({
    super.key,
    required this.data,
    this.selectable = true,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;

    return MarkdownBody(
      data: data,
      selectable: selectable,
      styleSheet: MarkdownStyleSheet(
        p: theme.textTheme.bodyMedium?.copyWith(
          color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
          height: 1.6,
        ),
        h1: theme.textTheme.headlineMedium?.copyWith(
          color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
        ),
        h2: theme.textTheme.headlineSmall?.copyWith(
          color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
        ),
        h3: theme.textTheme.titleMedium?.copyWith(
          color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
          fontWeight: FontWeight.w600,
        ),
        code: theme.textTheme.bodySmall?.copyWith(
          fontFamily: 'monospace',
          backgroundColor: isDark
              ? AppColors.darkSurfaceVariant
              : AppColors.surfaceVariant,
          color: AppColors.primary,
        ),
        codeblockDecoration: BoxDecoration(
          color: isDark ? AppColors.darkSurfaceVariant : AppColors.surfaceVariant,
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: isDark ? AppColors.darkBorder : AppColors.border,
          ),
        ),
        blockquoteDecoration: BoxDecoration(
          border: Border(
            left: BorderSide(color: AppColors.primary, width: 3),
          ),
        ),
        blockquotePadding: const EdgeInsets.only(left: 12, top: 4, bottom: 4),
        blockquote: theme.textTheme.bodyMedium?.copyWith(
          color: isDark ? AppColors.darkTextSecondary : AppColors.textSecondary,
          fontStyle: FontStyle.italic,
        ),
        tableHead: theme.textTheme.bodySmall?.copyWith(
          fontWeight: FontWeight.w600,
        ),
        tableBorder: TableBorder.all(
          color: isDark ? AppColors.darkBorder : AppColors.border,
          width: 1,
        ),
        tableCellsPadding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
        listBullet: theme.textTheme.bodyMedium?.copyWith(
          color: AppColors.primary,
        ),
        strong: theme.textTheme.bodyMedium?.copyWith(
          fontWeight: FontWeight.w700,
          color: isDark ? AppColors.darkTextPrimary : AppColors.textPrimary,
        ),
        em: theme.textTheme.bodyMedium?.copyWith(
          fontStyle: FontStyle.italic,
        ),
        a: theme.textTheme.bodyMedium?.copyWith(
          color: AppColors.primary,
          decoration: TextDecoration.underline,
          decorationColor: AppColors.primary,
        ),
      ),
    );
  }
}
