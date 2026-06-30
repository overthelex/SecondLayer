import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../auth/domain/auth_notifier.dart';
import '../../navigation/route_names.dart';

class MoreScreen extends ConsumerWidget {
  const MoreScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final authState = ref.watch(authNotifierProvider);
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(title: const Text('Ще')),
      body: ListView(
        children: [
          if (authState.user != null)
            Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  CircleAvatar(
                    radius: 28,
                    backgroundImage: authState.user!.avatarUrl != null
                        ? NetworkImage(authState.user!.avatarUrl!)
                        : null,
                    child: authState.user!.avatarUrl == null
                        ? Text(authState.user!.name.isNotEmpty
                            ? authState.user!.name[0].toUpperCase()
                            : '?')
                        : null,
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(authState.user!.name,
                            style: theme.textTheme.titleMedium),
                        Text(authState.user!.email,
                            style: theme.textTheme.bodySmall),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          const Divider(),
          _MenuItem(
            icon: Icons.people_outline,
            title: 'Клієнти',
            onTap: () => context.goNamed(RouteNames.clients),
          ),
          _MenuItem(
            icon: Icons.folder_outlined,
            title: 'Справи',
            onTap: () => context.goNamed(RouteNames.matters),
          ),
          _MenuItem(
            icon: Icons.timer_outlined,
            title: 'Облік часу',
            onTap: () => context.goNamed(RouteNames.timeTracking),
          ),
          _MenuItem(
            icon: Icons.payments_outlined,
            title: 'Білінг',
            onTap: () => context.goNamed(RouteNames.billing),
          ),
          _MenuItem(
            icon: Icons.extension_outlined,
            title: 'MCP конект',
            onTap: () => context.goNamed(RouteNames.mcpConnect),
          ),
          const Divider(),
          _MenuItem(
            icon: Icons.person_outline,
            title: 'Профіль',
            onTap: () => context.goNamed(RouteNames.profile),
          ),
          _MenuItem(
            icon: Icons.logout,
            title: 'Вийти',
            color: theme.colorScheme.error,
            onTap: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (ctx) => AlertDialog(
                  title: const Text('Вийти?'),
                  content: const Text('Ви впевнені, що хочете вийти з акаунту?'),
                  actions: [
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, false),
                      child: const Text('Скасувати'),
                    ),
                    TextButton(
                      onPressed: () => Navigator.pop(ctx, true),
                      child: const Text('Вийти'),
                    ),
                  ],
                ),
              );
              if (confirmed == true) {
                ref.read(authNotifierProvider.notifier).logout();
              }
            },
          ),
        ],
      ),
    );
  }
}

class _MenuItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;
  final Color? color;

  const _MenuItem({
    required this.icon,
    required this.title,
    required this.onTap,
    this.color,
  });

  @override
  Widget build(BuildContext context) {
    return ListTile(
      leading: Icon(icon, color: color),
      title: Text(title, style: color != null ? TextStyle(color: color) : null),
      trailing: const Icon(Icons.chevron_right),
      onTap: onTap,
    );
  }
}
