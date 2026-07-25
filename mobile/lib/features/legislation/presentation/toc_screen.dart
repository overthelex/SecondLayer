import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../domain/legislation_notifier.dart';
import '../data/models/legislation.dart';
import '../../../navigation/route_names.dart';
import '../../../shared/widgets/loading_indicator.dart';
import '../../../shared/widgets/error_state.dart';

class LegislationTocScreen extends ConsumerWidget {
  final String legislationId;

  const LegislationTocScreen({super.key, required this.legislationId});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final structureAsync = ref.watch(structureProvider(legislationId));

    return Scaffold(
      appBar: AppBar(title: const Text('Зміст')),
      body: structureAsync.when(
        loading: () => const LoadingIndicator(),
        error: (err, _) => ErrorState(
          message: err.toString(),
          onRetry: () => ref.invalidate(structureProvider(legislationId)),
        ),
        data: (sections) => sections.isEmpty
            ? const Center(child: Text('Структура не знайдена'))
            : ListView.builder(
                itemCount: sections.length,
                itemBuilder: (_, index) {
                  return _SectionTile(
                    section: sections[index],
                    legislationId: legislationId,
                    depth: 0,
                  );
                },
              ),
      ),
    );
  }
}

class _SectionTile extends StatelessWidget {
  final LegislationSection section;
  final String legislationId;
  final int depth;

  const _SectionTile({
    required this.section,
    required this.legislationId,
    required this.depth,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isArticle = section.type == 'article';

    if (section.children.isEmpty) {
      return ListTile(
        contentPadding: EdgeInsets.only(left: 16.0 + depth * 16),
        leading: Icon(
          isArticle ? Icons.article : Icons.folder_outlined,
          size: 20,
          color: theme.colorScheme.primary,
        ),
        title: Text(
          section.title,
          style: isArticle
              ? theme.textTheme.bodyMedium
              : theme.textTheme.titleSmall,
        ),
        onTap: isArticle && section.number != null
            ? () => context.pushNamed(
                  RouteNames.legislationArticle,
                  pathParameters: {
                    'id': legislationId,
                    'num': section.number.toString(),
                  },
                )
            : null,
      );
    }

    return ExpansionTile(
      tilePadding: EdgeInsets.only(left: 16.0 + depth * 16, right: 16),
      leading: Icon(Icons.folder, size: 20, color: theme.colorScheme.primary),
      title: Text(section.title, style: theme.textTheme.titleSmall),
      children: section.children
          .map((child) => _SectionTile(
                section: child,
                legislationId: legislationId,
                depth: depth + 1,
              ))
          .toList(),
    );
  }
}
