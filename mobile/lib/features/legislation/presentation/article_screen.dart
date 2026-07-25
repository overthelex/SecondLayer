import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:go_router/go_router.dart';
import '../domain/legislation_notifier.dart';
import '../../../navigation/route_names.dart';
import '../../../shared/widgets/loading_indicator.dart';
import '../../../shared/widgets/error_state.dart';

class LegislationArticleScreen extends ConsumerWidget {
  final String legislationId;
  final String articleNumber;

  const LegislationArticleScreen({
    super.key,
    required this.legislationId,
    required this.articleNumber,
  });

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final articleAsync = ref.watch(articleProvider(
      (legislationId: legislationId, articleNumber: articleNumber),
    ));
    final theme = Theme.of(context);
    final currentNum = int.tryParse(articleNumber) ?? 0;

    return Scaffold(
      appBar: AppBar(title: Text('Стаття $articleNumber')),
      body: articleAsync.when(
        loading: () => const LoadingIndicator(),
        error: (err, _) => ErrorState(
          message: err.toString(),
          onRetry: () => ref.invalidate(articleProvider(
            (legislationId: legislationId, articleNumber: articleNumber),
          )),
        ),
        data: (article) => Column(
          children: [
            Expanded(
              child: SingleChildScrollView(
                padding: const EdgeInsets.all(16),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      article.title.isNotEmpty
                          ? article.title
                          : 'Стаття ${article.number}',
                      style: theme.textTheme.headlineSmall,
                    ),
                    const SizedBox(height: 16),
                    MarkdownBody(
                      data: article.content,
                      selectable: true,
                    ),
                  ],
                ),
              ),
            ),

            // Navigation
            Container(
              padding: EdgeInsets.only(
                left: 16,
                right: 16,
                top: 8,
                bottom: MediaQuery.of(context).padding.bottom + 8,
              ),
              decoration: BoxDecoration(
                color: theme.colorScheme.surface,
                border: Border(
                  top: BorderSide(
                    color: theme.colorScheme.outline.withValues(alpha: 0.2),
                  ),
                ),
              ),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  if (currentNum > 1)
                    TextButton.icon(
                      onPressed: () => context.pushReplacementNamed(
                        RouteNames.legislationArticle,
                        pathParameters: {
                          'id': legislationId,
                          'num': (currentNum - 1).toString(),
                        },
                      ),
                      icon: const Icon(Icons.arrow_back),
                      label: Text('Ст. ${currentNum - 1}'),
                    )
                  else
                    const SizedBox(),
                  TextButton.icon(
                    onPressed: () => context.pushReplacementNamed(
                      RouteNames.legislationArticle,
                      pathParameters: {
                        'id': legislationId,
                        'num': (currentNum + 1).toString(),
                      },
                    ),
                    icon: const Icon(Icons.arrow_forward),
                    label: Text('Ст. ${currentNum + 1}'),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
