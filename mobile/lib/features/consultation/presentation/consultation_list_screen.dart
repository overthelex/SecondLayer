import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../domain/consultation_notifier.dart';
import '../../../shared/theme/app_colors.dart';

class ConsultationListScreen extends ConsumerStatefulWidget {
  const ConsultationListScreen({super.key});

  @override
  ConsumerState<ConsultationListScreen> createState() =>
      _ConsultationListScreenState();
}

class _ConsultationListScreenState
    extends ConsumerState<ConsultationListScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(
        () => ref.read(consultationListProvider.notifier).loadConsultations());
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(consultationListProvider);
    final theme = Theme.of(context);
    final dateFormat = DateFormat('dd.MM.yyyy HH:mm', 'uk');

    return Scaffold(
      appBar: AppBar(
        title: const Text('Консультації'),
      ),
      body: state.isLoadingConsultations
          ? const Center(child: CircularProgressIndicator())
          : state.consultations.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.forum_outlined,
                          size: 48,
                          color: theme.colorScheme.onSurfaceVariant),
                      const SizedBox(height: 12),
                      Text(
                        'Немає консультацій',
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: theme.colorScheme.onSurfaceVariant,
                        ),
                      ),
                    ],
                  ),
                )
              : ListView.separated(
                  itemCount: state.consultations.length,
                  separatorBuilder: (_, __) => const Divider(height: 1),
                  itemBuilder: (_, index) {
                    final c = state.consultations[index];
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundColor: AppColors.primary.withValues(alpha: 0.12),
                        child: Text(
                          (c.clientName ?? c.title)
                              .substring(0, 1)
                              .toUpperCase(),
                          style: const TextStyle(
                            color: AppColors.primary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                      title: Text(
                        c.title,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: theme.textTheme.bodyMedium?.copyWith(
                          fontWeight: c.unreadCount > 0
                              ? FontWeight.w600
                              : FontWeight.w400,
                        ),
                      ),
                      subtitle: Text(
                        dateFormat.format(c.updatedAt),
                        style: theme.textTheme.bodySmall,
                      ),
                      trailing: c.unreadCount > 0
                          ? Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 8, vertical: 2),
                              decoration: BoxDecoration(
                                color: AppColors.primary,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(
                                '${c.unreadCount}',
                                style: const TextStyle(
                                  color: Colors.white,
                                  fontSize: 11,
                                  fontWeight: FontWeight.w600,
                                ),
                              ),
                            )
                          : null,
                      onTap: () => context.go('/consultations/${c.id}'),
                    );
                  },
                ),
    );
  }
}
