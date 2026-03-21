import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import '../data/models/consultation.dart';
import '../domain/consultation_notifier.dart';
import '../domain/consultation_state.dart';
import '../../../shared/theme/app_colors.dart';

class ConsultationListScreen extends ConsumerStatefulWidget {
  const ConsultationListScreen({super.key});

  @override
  ConsumerState<ConsultationListScreen> createState() =>
      _ConsultationListScreenState();
}

class _ConsultationListScreenState
    extends ConsumerState<ConsultationListScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;
  bool _isAttorney = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
    Future.microtask(() {
      ref.read(consultationListProvider.notifier).loadConsultations();
      _checkAttorneyAndLoadPayouts();
    });
  }

  void _checkAttorneyAndLoadPayouts() {
    // Always show tabs — backend will return empty payouts for non-attorneys
    setState(() => _isAttorney = true);
    ref.read(consultationListProvider.notifier).loadPayouts();
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final state = ref.watch(consultationListProvider);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Консультації'),
        bottom: _isAttorney
            ? TabBar(
                controller: _tabController,
                tabs: const [
                  Tab(text: 'Список'),
                  Tab(text: 'Виплати'),
                ],
              )
            : null,
      ),
      body: _isAttorney
          ? TabBarView(
              controller: _tabController,
              children: [
                _ConsultationsTab(state: state),
                _PayoutsTab(state: state),
              ],
            )
          : _ConsultationsTab(state: state),
    );
  }
}

class _ConsultationsTab extends StatelessWidget {
  final ConsultationState state;
  const _ConsultationsTab({required this.state});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateFormat = DateFormat('dd.MM.yyyy HH:mm', 'uk');

    if (state.isLoadingConsultations) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.consultations.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.forum_outlined,
                size: 48, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(
              'Немає консультацій',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      );
    }

    return ListView.separated(
      itemCount: state.consultations.length,
      separatorBuilder: (_, __) => const Divider(height: 1),
      itemBuilder: (_, index) {
        final c = state.consultations[index];
        return ListTile(
          leading: CircleAvatar(
            backgroundColor: AppColors.primary.withValues(alpha: 0.12),
            child: Text(
              (c.clientName ?? c.title).substring(0, 1).toUpperCase(),
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
              fontWeight:
                  c.unreadCount > 0 ? FontWeight.w600 : FontWeight.w400,
            ),
          ),
          subtitle: Row(
            children: [
              Text(
                dateFormat.format(c.updatedAt),
                style: theme.textTheme.bodySmall,
              ),
              if (c.agreedFeeUah != null) ...[
                const SizedBox(width: 8),
                Text(
                  '${c.agreedFeeUah!.toStringAsFixed(0)} грн',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.primary,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
              const SizedBox(width: 8),
              _StatusChip(status: c.status),
            ],
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
    );
  }
}

class _PayoutsTab extends StatelessWidget {
  final ConsultationState state;
  const _PayoutsTab({required this.state});

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final dateFormat = DateFormat('dd.MM.yyyy', 'uk');

    if (state.isLoadingPayouts) {
      return const Center(child: CircularProgressIndicator());
    }

    if (state.payouts.isEmpty) {
      return Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(Icons.payments_outlined,
                size: 48, color: theme.colorScheme.onSurfaceVariant),
            const SizedBox(height: 12),
            Text(
              'Виплат поки немає',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      );
    }

    // Summary cards
    final totalAmount =
        state.payouts.fold<double>(0, (sum, p) => sum + p.amountUah);
    final pendingAmount = state.payouts
        .where((p) => p.status == 'pending')
        .fold<double>(0, (sum, p) => sum + p.amountUah);
    final paidAmount = state.payouts
        .where((p) => p.status == 'paid')
        .fold<double>(0, (sum, p) => sum + p.amountUah);

    return Column(
      children: [
        // Summary cards
        Padding(
          padding: const EdgeInsets.all(16),
          child: Row(
            children: [
              _SummaryCard(
                label: 'Всього',
                amount: totalAmount,
                color: AppColors.primary,
              ),
              const SizedBox(width: 8),
              _SummaryCard(
                label: 'Очікує',
                amount: pendingAmount,
                color: Colors.orange,
              ),
              const SizedBox(width: 8),
              _SummaryCard(
                label: 'Виплачено',
                amount: paidAmount,
                color: Colors.green,
              ),
            ],
          ),
        ),

        // Payout list
        Expanded(
          child: ListView.separated(
            itemCount: state.payouts.length,
            separatorBuilder: (_, __) => const Divider(height: 1),
            itemBuilder: (_, index) {
              final p = state.payouts[index];
              return ListTile(
                leading: CircleAvatar(
                  backgroundColor: _statusColor(p.status).withValues(alpha: 0.12),
                  child: Icon(
                    _statusIcon(p.status),
                    color: _statusColor(p.status),
                    size: 20,
                  ),
                ),
                title: Text(
                  p.requestTitle ?? 'Консультація',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                ),
                subtitle: Text(dateFormat.format(p.createdAt)),
                trailing: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Text(
                      '${p.amountUah.toStringAsFixed(0)} грн',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    _StatusChip(status: p.status),
                  ],
                ),
              );
            },
          ),
        ),
      ],
    );
  }

  Color _statusColor(String status) {
    switch (status) {
      case 'paid':
        return Colors.green;
      case 'pending':
        return Colors.orange;
      case 'failed':
        return AppColors.error;
      default:
        return AppColors.textSecondary;
    }
  }

  IconData _statusIcon(String status) {
    switch (status) {
      case 'paid':
        return Icons.check_circle_outline;
      case 'pending':
        return Icons.schedule;
      case 'failed':
        return Icons.error_outline;
      default:
        return Icons.payments_outlined;
    }
  }
}

class _SummaryCard extends StatelessWidget {
  final String label;
  final double amount;
  final Color color;

  const _SummaryCard({
    required this.label,
    required this.amount,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Expanded(
      child: Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withValues(alpha: 0.2)),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              label,
              style: theme.textTheme.labelSmall?.copyWith(
                color: color,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${amount.toStringAsFixed(0)} грн',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w700,
                color: color,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _StatusChip extends StatelessWidget {
  final String status;
  const _StatusChip({required this.status});

  @override
  Widget build(BuildContext context) {
    final (label, color) = _statusInfo(status);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }

  (String, Color) _statusInfo(String status) {
    switch (status) {
      case 'pending':
        return ('Очікує', Colors.orange);
      case 'accepted':
        return ('Прийнято', Colors.blue);
      case 'active':
        return ('Активна', Colors.green);
      case 'completed':
        return ('Завершено', AppColors.primary);
      case 'declined':
        return ('Відхилено', AppColors.error);
      case 'cancelled':
        return ('Скасовано', AppColors.textSecondary);
      case 'paid':
        return ('Виплачено', Colors.green);
      case 'failed':
        return ('Помилка', AppColors.error);
      default:
        return (status, AppColors.textSecondary);
    }
  }
}
