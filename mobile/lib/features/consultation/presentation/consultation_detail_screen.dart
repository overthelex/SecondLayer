import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:url_launcher/url_launcher.dart';
import '../../../shared/theme/app_colors.dart';
import '../../auth/domain/auth_notifier.dart';
import '../data/models/consultation.dart';
import '../domain/consultation_notifier.dart';

class ConsultationDetailScreen extends ConsumerStatefulWidget {
  final String consultationId;

  const ConsultationDetailScreen({super.key, required this.consultationId});

  @override
  ConsumerState<ConsultationDetailScreen> createState() =>
      _ConsultationDetailScreenState();
}

class _ConsultationDetailScreenState
    extends ConsumerState<ConsultationDetailScreen> {
  @override
  void initState() {
    super.initState();
    Future.microtask(() => ref
        .read(consultationDetailProvider(widget.consultationId).notifier)
        .loadConsultation());
  }

  @override
  Widget build(BuildContext context) {
    final detailState =
        ref.watch(consultationDetailProvider(widget.consultationId));
    final authState = ref.watch(authNotifierProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: const Text('Консультація'),
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh),
            onPressed: () => ref
                .read(
                    consultationDetailProvider(widget.consultationId).notifier)
                .refreshConsultation(),
          ),
        ],
      ),
      body: detailState.isLoading
          ? const Center(child: CircularProgressIndicator())
          : detailState.consultation == null
              ? Center(
                  child: Text(
                    detailState.error ?? 'Не вдалося завантажити',
                    style: theme.textTheme.bodyLarge,
                  ),
                )
              : _DetailBody(
                  consultation: detailState.consultation!,
                  payment: detailState.payment,
                  isActionLoading: detailState.isActionLoading,
                  currentUserId: authState.user?.id,
                  currentUserRole: authState.user?.role,
                  consultationId: widget.consultationId,
                ),
    );
  }
}

class _DetailBody extends ConsumerWidget {
  final Consultation consultation;
  final ConsultationPayment? payment;
  final bool isActionLoading;
  final String? currentUserId;
  final String? currentUserRole;
  final String consultationId;

  const _DetailBody({
    required this.consultation,
    this.payment,
    required this.isActionLoading,
    this.currentUserId,
    this.currentUserRole,
    required this.consultationId,
  });

  bool get _isAttorney =>
      currentUserRole == 'attorney' ||
      currentUserId == consultation.attorneyUserId;

  bool get _isClient =>
      currentUserRole != 'attorney' &&
      (currentUserId == consultation.clientUserId ||
          consultation.attorneyUserId != currentUserId);

  bool get _isTerminal => const ['completed', 'cancelled', 'declined', 'disputed']
      .contains(consultation.status);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final notifier =
        ref.read(consultationDetailProvider(consultationId).notifier);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Info card
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    consultation.title,
                    style: theme.textTheme.titleLarge
                        ?.copyWith(fontWeight: FontWeight.w600),
                  ),
                  if (consultation.requestDescription != null &&
                      consultation.requestDescription!.isNotEmpty) ...[
                    const SizedBox(height: 8),
                    Text(
                      consultation.requestDescription!,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                      ),
                    ),
                  ],
                  const SizedBox(height: 16),
                  _InfoRow(
                    icon: Icons.person_outline,
                    label: 'Клієнт',
                    value: consultation.clientName ?? '—',
                  ),
                  const SizedBox(height: 8),
                  _InfoRow(
                    icon: Icons.gavel,
                    label: 'Юрист',
                    value: consultation.attorneyName ?? '—',
                  ),
                  if (consultation.agreedFeeUah != null) ...[
                    const SizedBox(height: 8),
                    _InfoRow(
                      icon: Icons.payments_outlined,
                      label: 'Вартість',
                      value:
                          '${consultation.agreedFeeUah!.toStringAsFixed(0)} грн',
                    ),
                  ],
                ],
              ),
            ),
          ),
          const SizedBox(height: 16),

          // Status timeline (non-terminal only)
          if (!_isTerminal) _StatusTimeline(status: consultation.status),

          // Terminal status alert
          if (_isTerminal) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.error.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(
                    color: AppColors.error.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline,
                      color: AppColors.error, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      _terminalStatusText(),
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: AppColors.error),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Escrow badge
          if (payment != null) ...[
            Container(
              width: double.infinity,
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: AppColors.info.withValues(alpha: 0.08),
                borderRadius: BorderRadius.circular(8),
                border:
                    Border.all(color: AppColors.info.withValues(alpha: 0.3)),
              ),
              child: Row(
                children: [
                  const Icon(Icons.account_balance_wallet,
                      color: AppColors.info, size: 20),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      'Оплата: ${payment!.amountUah.toStringAsFixed(0)} грн (${_paymentStatusText(payment!.status)})',
                      style: theme.textTheme.bodyMedium
                          ?.copyWith(color: AppColors.info),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 16),
          ],

          // Action buttons
          if (!isActionLoading) ..._buildActionButtons(context, ref, notifier),
          if (isActionLoading)
            const Center(
              child: Padding(
                padding: EdgeInsets.all(16),
                child: CircularProgressIndicator(),
              ),
            ),

          const SizedBox(height: 24),

          // Navigate to chat
          SizedBox(
            width: double.infinity,
            child: OutlinedButton.icon(
              onPressed: () =>
                  context.go('/consultations/$consultationId'),
              icon: const Icon(Icons.chat_outlined),
              label: const Text('Перейти до чату'),
            ),
          ),
        ],
      ),
    );
  }

  String _terminalStatusText() {
    switch (consultation.status) {
      case 'completed':
        return 'Консультацію завершено';
      case 'cancelled':
        return 'Консультацію скасовано${consultation.cancelReason != null ? ': ${consultation.cancelReason}' : ''}';
      case 'declined':
        return 'Консультацію відхилено${consultation.declineReason != null ? ': ${consultation.declineReason}' : ''}';
      case 'disputed':
        return 'Консультація оскаржена';
      default:
        return consultation.status;
    }
  }

  String _paymentStatusText(String status) {
    switch (status) {
      case 'pending':
        return 'очікує';
      case 'paid':
        return 'оплачено';
      case 'held':
        return 'на ескроу';
      case 'released':
        return 'виплачено';
      case 'refunded':
        return 'повернено';
      default:
        return status;
    }
  }

  List<Widget> _buildActionButtons(
    BuildContext context,
    WidgetRef ref,
    ConsultationDetailNotifier notifier,
  ) {
    final buttons = <Widget>[];

    // Attorney + pending: Accept + Decline
    if (_isAttorney && consultation.status == 'pending') {
      buttons.add(
        Row(
          children: [
            Expanded(
              child: FilledButton.icon(
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.success,
                ),
                onPressed: () => _showAcceptDialog(context, notifier),
                icon: const Icon(Icons.check),
                label: const Text('Прийняти'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: OutlinedButton.icon(
                style: OutlinedButton.styleFrom(
                  foregroundColor: AppColors.error,
                  side: const BorderSide(color: AppColors.error),
                ),
                onPressed: () => _showDeclineDialog(context, notifier),
                icon: const Icon(Icons.close),
                label: const Text('Відхилити'),
              ),
            ),
          ],
        ),
      );
    }

    // Client + accepted: Pay
    if (_isClient && consultation.status == 'accepted') {
      final fee = consultation.agreedFeeUah?.toStringAsFixed(0) ?? '0';
      buttons.add(
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () => _showPaymentDialog(context, notifier),
            icon: const Icon(Icons.payment),
            label: Text('Оплатити $fee \u20b4'),
          ),
        ),
      );
    }

    // Attorney + paid: Start
    if (_isAttorney && consultation.status == 'paid') {
      buttons.add(
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            onPressed: () async {
              final ok = await notifier.startConsultation();
              if (ok && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Роботу розпочато')),
                );
              }
            },
            icon: const Icon(Icons.play_arrow),
            label: const Text('Розпочати роботу'),
          ),
        ),
      );
    }

    // Attorney + in_progress: Complete
    if (_isAttorney && consultation.status == 'in_progress') {
      buttons.add(
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.success,
            ),
            onPressed: () => _showCompleteDialog(context, notifier),
            icon: const Icon(Icons.check_circle),
            label: const Text('Завершити'),
          ),
        ),
      );
    }

    // Client + completed: Review
    if (_isClient && consultation.status == 'completed') {
      buttons.add(
        SizedBox(
          width: double.infinity,
          child: FilledButton.icon(
            style: FilledButton.styleFrom(
              backgroundColor: Colors.amber.shade700,
            ),
            onPressed: () => _showReviewDialog(context, notifier),
            icon: const Icon(Icons.star),
            label: const Text('Залишити відгук'),
          ),
        ),
      );
    }

    // Either + non-terminal: Cancel
    if (!_isTerminal) {
      buttons.add(
        SizedBox(
          width: double.infinity,
          child: TextButton.icon(
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            onPressed: () => _showCancelDialog(context, notifier),
            icon: const Icon(Icons.cancel_outlined),
            label: const Text('Скасувати'),
          ),
        ),
      );
    }

    // Add spacing between buttons
    final spaced = <Widget>[];
    for (var i = 0; i < buttons.length; i++) {
      spaced.add(buttons[i]);
      if (i < buttons.length - 1) spaced.add(const SizedBox(height: 8));
    }
    return spaced;
  }

  void _showAcceptDialog(
      BuildContext context, ConsultationDetailNotifier notifier) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Прийняти консультацію'),
        content: TextField(
          controller: controller,
          keyboardType: const TextInputType.numberWithOptions(decimal: true),
          decoration: const InputDecoration(
            labelText: 'Вартість (грн)',
            hintText: 'Введіть суму',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Скасувати'),
          ),
          FilledButton(
            onPressed: () async {
              final fee = double.tryParse(controller.text.trim());
              if (fee == null || fee <= 0) return;
              Navigator.pop(ctx);
              final ok = await notifier.acceptConsultation(fee);
              if (ok && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(
                      content: Text(
                          'Прийнято за ${fee.toStringAsFixed(0)} \u20b4')),
                );
              }
            },
            child: const Text('Прийняти'),
          ),
        ],
      ),
    );
  }

  void _showDeclineDialog(
      BuildContext context, ConsultationDetailNotifier notifier) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Відхилити консультацію'),
        content: TextField(
          controller: controller,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Причина',
            hintText: 'Вкажіть причину відмови',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Скасувати'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              final reason = controller.text.trim();
              if (reason.isEmpty) return;
              Navigator.pop(ctx);
              await notifier.declineConsultation(reason);
            },
            child: const Text('Відхилити'),
          ),
        ],
      ),
    );
  }

  void _showCompleteDialog(
      BuildContext context, ConsultationDetailNotifier notifier) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Завершити консультацію'),
        content: TextField(
          controller: controller,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Підсумок',
            hintText: 'Коротко опишіть результат',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Скасувати'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.success),
            onPressed: () async {
              final summary = controller.text.trim();
              if (summary.isEmpty) return;
              Navigator.pop(ctx);
              final ok = await notifier.completeConsultation(summary);
              if (ok && context.mounted) {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text('Консультацію завершено')),
                );
              }
            },
            child: const Text('Завершити консультацію'),
          ),
        ],
      ),
    );
  }

  void _showCancelDialog(
      BuildContext context, ConsultationDetailNotifier notifier) {
    final controller = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Скасувати консультацію'),
        content: TextField(
          controller: controller,
          maxLines: 3,
          decoration: const InputDecoration(
            labelText: 'Причина',
            hintText: 'Вкажіть причину скасування',
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Назад'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () async {
              final reason = controller.text.trim();
              if (reason.isEmpty) return;
              Navigator.pop(ctx);
              await notifier.cancelConsultation(reason);
            },
            child: const Text('Скасувати консультацію'),
          ),
        ],
      ),
    );
  }

  void _showPaymentDialog(
      BuildContext context, ConsultationDetailNotifier notifier) {
    final fee = consultation.agreedFeeUah ?? 0;
    final attorneyPart = fee * 0.7;
    final platformPart = fee * 0.3;

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Оплата консультації'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            _PaymentRow('Вартість:', '${fee.toStringAsFixed(0)} грн'),
            const Divider(),
            _PaymentRow(
                'Юристу (70%):', '${attorneyPart.toStringAsFixed(0)} грн'),
            _PaymentRow(
                'Платформа (30%):', '${platformPart.toStringAsFixed(0)} грн'),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: const Text('Скасувати'),
          ),
          FilledButton(
            onPressed: () async {
              Navigator.pop(ctx);
              final result = await notifier.initiatePayment();
              if (result != null && context.mounted) {
                final paymentUrl = result['paymentUrl'] as String?;
                if (paymentUrl != null) {
                  final uri = Uri.parse(paymentUrl);
                  await launchUrl(uri, mode: LaunchMode.externalApplication);
                }
              }
            },
            child: const Text('Оплатити'),
          ),
        ],
      ),
    );
  }

  void _showReviewDialog(
      BuildContext context, ConsultationDetailNotifier notifier) {
    int selectedRating = 5;
    final controller = TextEditingController();

    showDialog(
      context: context,
      builder: (ctx) => StatefulBuilder(
        builder: (ctx, setDialogState) => AlertDialog(
          title: const Text('Залишити відгук'),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: List.generate(5, (i) {
                  return IconButton(
                    onPressed: () =>
                        setDialogState(() => selectedRating = i + 1),
                    icon: Icon(
                      i < selectedRating ? Icons.star : Icons.star_border,
                      color: Colors.amber,
                      size: 32,
                    ),
                  );
                }),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: controller,
                maxLines: 3,
                decoration: const InputDecoration(
                  labelText: 'Коментар',
                  hintText: 'Ваш відгук (необов\'язково)',
                ),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('Скасувати'),
            ),
            FilledButton(
              onPressed: () async {
                Navigator.pop(ctx);
                final ok = await notifier.submitReview(
                    selectedRating, controller.text.trim());
                if (ok && context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('Дякуємо за відгук!')),
                  );
                }
              },
              child: const Text('Надіслати'),
            ),
          ],
        ),
      ),
    );
  }
}

class _PaymentRow extends StatelessWidget {
  final String label;
  final String value;

  const _PaymentRow(this.label, this.value);

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label),
          Text(value, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  final IconData icon;
  final String label;
  final String value;

  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
  });

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      children: [
        Icon(icon, size: 18, color: AppColors.textSecondary),
        const SizedBox(width: 8),
        Text(
          '$label: ',
          style: theme.textTheme.bodyMedium
              ?.copyWith(color: AppColors.textSecondary),
        ),
        Expanded(
          child: Text(
            value,
            style: theme.textTheme.bodyMedium,
          ),
        ),
      ],
    );
  }
}

class _StatusTimeline extends StatelessWidget {
  final String status;

  const _StatusTimeline({required this.status});

  static const _steps = [
    ('Запит', 'pending'),
    ('Прийнято', 'accepted'),
    ('Оплачено', 'paid'),
    ('В роботі', 'in_progress'),
    ('Завершено', 'completed'),
  ];

  int get _currentIndex {
    for (var i = 0; i < _steps.length; i++) {
      if (_steps[i].$2 == status) return i;
    }
    return 0;
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final current = _currentIndex;

    return Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: Row(
        children: List.generate(_steps.length * 2 - 1, (i) {
          if (i.isOdd) {
            // Connector line
            final stepIndex = i ~/ 2;
            final isCompleted = stepIndex < current;
            return Expanded(
              child: Container(
                height: 2,
                color: isCompleted
                    ? AppColors.success
                    : AppColors.border,
              ),
            );
          }

          final stepIndex = i ~/ 2;
          final isCompleted = stepIndex < current;
          final isCurrent = stepIndex == current;

          return Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                width: 24,
                height: 24,
                decoration: BoxDecoration(
                  shape: BoxShape.circle,
                  color: isCompleted
                      ? AppColors.success
                      : isCurrent
                          ? AppColors.primary
                          : AppColors.border,
                ),
                child: isCompleted
                    ? const Icon(Icons.check, size: 14, color: Colors.white)
                    : isCurrent
                        ? const Icon(Icons.circle,
                            size: 8, color: Colors.white)
                        : null,
              ),
              const SizedBox(height: 4),
              Text(
                _steps[stepIndex].$1,
                style: theme.textTheme.labelSmall?.copyWith(
                  color: isCurrent
                      ? AppColors.primary
                      : isCompleted
                          ? AppColors.success
                          : AppColors.textSecondary,
                  fontWeight: isCurrent ? FontWeight.w600 : FontWeight.w400,
                ),
              ),
            ],
          );
        }),
      ),
    );
  }
}
