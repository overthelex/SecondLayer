import 'package:flutter/material.dart';
import '../../../../shared/theme/app_colors.dart';

class ToolSelectorSheet extends StatelessWidget {
  final String selectedTool;
  final ValueChanged<String> onToolSelected;

  const ToolSelectorSheet({
    super.key,
    required this.selectedTool,
    required this.onToolSelected,
  });

  static const _toolCategories = <_ToolCategory>[
    _ToolCategory(
      name: 'AI Чат',
      icon: Icons.chat_bubble_outline,
      tools: [
        _ToolItem(id: 'ai_chat', name: 'AI Чат', description: 'Вільна розмова з AI'),
      ],
    ),
    _ToolCategory(
      name: 'Судова практика',
      icon: Icons.gavel,
      tools: [
        _ToolItem(id: 'search_legal_precedents', name: 'Пошук прецедентів', description: 'Семантичний пошук'),
        _ToolItem(id: 'search_court_decisions', name: 'Пошук рішень', description: 'За параметрами'),
      ],
    ),
    _ToolCategory(
      name: 'Законодавство',
      icon: Icons.menu_book,
      tools: [
        _ToolItem(id: 'search_legislation', name: 'Пошук законів', description: 'Текст нормативних актів'),
        _ToolItem(id: 'get_legislation_text', name: 'Текст статті', description: 'Конкретна стаття закону'),
      ],
    ),
    _ToolCategory(
      name: 'Документи',
      icon: Icons.folder_outlined,
      tools: [
        _ToolItem(id: 'vault_search', name: 'Пошук в сховищі', description: 'Пошук серед завантажених документів'),
      ],
    ),
    _ToolCategory(
      name: 'Аналітика',
      icon: Icons.analytics_outlined,
      tools: [
        _ToolItem(id: 'analyze_legal_patterns', name: 'Аналіз патернів', description: 'Правові патерни та тренди'),
        _ToolItem(id: 'validate_citations', name: 'Перевірка цитат', description: 'Валідація посилань'),
      ],
    ),
  ];

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.7,
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

          Padding(
            padding: const EdgeInsets.all(16),
            child: Text(
              'Оберіть інструмент',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w600,
              ),
            ),
          ),

          Flexible(
            child: ListView.builder(
              shrinkWrap: true,
              padding: const EdgeInsets.only(bottom: 16),
              itemCount: _toolCategories.length,
              itemBuilder: (_, catIdx) {
                final cat = _toolCategories[catIdx];
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Padding(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 16, vertical: 8),
                      child: Row(
                        children: [
                          Icon(cat.icon,
                              size: 16,
                              color: theme.colorScheme.onSurfaceVariant),
                          const SizedBox(width: 8),
                          Text(
                            cat.name,
                            style: theme.textTheme.labelLarge?.copyWith(
                              color: theme.colorScheme.onSurfaceVariant,
                            ),
                          ),
                        ],
                      ),
                    ),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16),
                      child: Wrap(
                        spacing: 8,
                        runSpacing: 8,
                        children: cat.tools.map((tool) {
                          final isSelected = tool.id == selectedTool;
                          return GestureDetector(
                            onTap: () {
                              onToolSelected(tool.id);
                              Navigator.pop(context);
                            },
                            child: Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 12, vertical: 8),
                              decoration: BoxDecoration(
                                color: isSelected
                                    ? AppColors.primary.withValues(alpha: 0.12)
                                    : theme.colorScheme.surfaceContainerHighest,
                                borderRadius: BorderRadius.circular(20),
                                border: isSelected
                                    ? Border.all(
                                        color:
                                            AppColors.primary.withValues(alpha: 0.5))
                                    : null,
                              ),
                              child: Text(
                                tool.name,
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color: isSelected
                                      ? AppColors.primary
                                      : theme.colorScheme.onSurface,
                                  fontWeight: isSelected
                                      ? FontWeight.w600
                                      : FontWeight.w400,
                                ),
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ),
                  ],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _ToolCategory {
  final String name;
  final IconData icon;
  final List<_ToolItem> tools;

  const _ToolCategory({
    required this.name,
    required this.icon,
    required this.tools,
  });
}

class _ToolItem {
  final String id;
  final String name;
  final String description;

  const _ToolItem({
    required this.id,
    required this.name,
    required this.description,
  });
}
