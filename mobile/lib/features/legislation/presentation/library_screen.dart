import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../domain/legislation_notifier.dart';
import '../../../navigation/route_names.dart';
import '../../../shared/widgets/loading_indicator.dart';
import '../../../shared/widgets/error_state.dart';

class LegislationLibraryScreen extends ConsumerWidget {
  const LegislationLibraryScreen({super.key});

  static const _codeIcons = {
    'constitution': Icons.account_balance,
    'civil': Icons.people,
    'criminal': Icons.gavel,
    'commercial': Icons.business,
    'administrative': Icons.admin_panel_settings,
    'labor': Icons.work,
    'family': Icons.family_restroom,
    'land': Icons.terrain,
    'tax': Icons.payments,
  };

  IconData _iconForCode(String shortTitle) {
    final lower = shortTitle.toLowerCase();
    for (final entry in _codeIcons.entries) {
      if (lower.contains(entry.key)) return entry.value;
    }
    return Icons.menu_book;
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final codesAsync = ref.watch(codesProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Законодавство')),
      body: codesAsync.when(
        loading: () => const LoadingIndicator(),
        error: (err, _) => ErrorState(
          message: err.toString(),
          onRetry: () => ref.invalidate(codesProvider),
        ),
        data: (codes) => codes.isEmpty
            ? const Center(child: Text('Немає кодексів'))
            : GridView.builder(
                padding: const EdgeInsets.all(16),
                gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                  crossAxisCount: 2,
                  crossAxisSpacing: 12,
                  mainAxisSpacing: 12,
                  childAspectRatio: 1.2,
                ),
                itemCount: codes.length,
                itemBuilder: (_, index) {
                  final code = codes[index];
                  return Card(
                    child: InkWell(
                      borderRadius: BorderRadius.circular(12),
                      onTap: () => context.pushNamed(
                        RouteNames.legislationToc,
                        pathParameters: {'id': code.id},
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            Icon(
                              _iconForCode(code.shortTitle),
                              size: 36,
                              color: theme.colorScheme.primary,
                            ),
                            const SizedBox(height: 8),
                            Text(
                              code.shortTitle.isNotEmpty
                                  ? code.shortTitle
                                  : code.title,
                              textAlign: TextAlign.center,
                              maxLines: 2,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.labelLarge,
                            ),
                            if (code.articleCount != null)
                              Text(
                                '${code.articleCount} статей',
                                style: theme.textTheme.bodySmall?.copyWith(
                                  color:
                                      theme.colorScheme.onSurfaceVariant,
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                  );
                },
              ),
      ),
    );
  }
}
