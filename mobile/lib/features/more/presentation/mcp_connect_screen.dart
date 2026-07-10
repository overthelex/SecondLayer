import 'package:flutter/material.dart';
import '../../../shared/theme/app_colors.dart';

/// Screen "08 MCP конект" — external service integrations (MCP connect).
/// OAuth integrations are still under development, so the toggles are disabled.
class McpConnectScreen extends StatelessWidget {
  const McpConnectScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('MCP конект')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: const [
          Text(
            'Підключіть зовнішні сервіси для роботи з документами',
            style: TextStyle(
              color: AppColors.textSecondary,
              fontSize: 12.5,
            ),
          ),
          SizedBox(height: 16),
          _IntegrationCard(
            icon: Icons.cloud,
            title: 'Nextcloud',
            description:
                'Синхронізація документів з вашого Nextcloud сервера',
          ),
          _IntegrationCard(
            icon: Icons.folder,
            title: 'Google Drive',
            description: 'Доступ до файлів та документів з Google Drive',
          ),
          SizedBox(height: 8),
          Text(
            'OAuth-інтеграція для цих сервісів ще розробляється.',
            style: TextStyle(
              color: AppColors.textTertiary,
              fontSize: 11,
              fontStyle: FontStyle.italic,
            ),
          ),
        ],
      ),
    );
  }
}

class _IntegrationCard extends StatelessWidget {
  final IconData icon;
  final String title;
  final String description;

  const _IntegrationCard({
    required this.icon,
    required this.title,
    required this.description,
  });

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.only(bottom: 9),
      padding: const EdgeInsets.all(13),
      decoration: BoxDecoration(
        color: AppColors.surface,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 34,
            height: 34,
            decoration: BoxDecoration(
              color: AppColors.surfaceVariant,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Icon(icon, size: 19, color: AppColors.zinc700),
          ),
          const SizedBox(width: 11),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Flexible(
                      child: Text(
                        title,
                        style: const TextStyle(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w600,
                          color: AppColors.textPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    const _InDevelopmentPill(),
                  ],
                ),
                const SizedBox(height: 4),
                Text(
                  description,
                  style: const TextStyle(
                    fontSize: 12,
                    color: AppColors.textSecondary,
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: 6),
          // Disabled toggle — integration not yet available.
          Switch(
            value: false,
            onChanged: null,
          ),
        ],
      ),
    );
  }
}

class _InDevelopmentPill extends StatelessWidget {
  const _InDevelopmentPill();

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: AppColors.surfaceVariant,
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(999),
      ),
      child: const Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(Icons.access_time, size: 10, color: AppColors.textSecondary),
          SizedBox(width: 3),
          Text(
            'У розробці',
            style: TextStyle(
              fontSize: 9.5,
              fontWeight: FontWeight.w600,
              color: AppColors.textSecondary,
            ),
          ),
        ],
      ),
    );
  }
}
