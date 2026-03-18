import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:file_picker/file_picker.dart';
import 'package:intl/intl.dart';
import '../domain/document_notifier.dart';
import '../../../shared/widgets/loading_indicator.dart';
import '../../../shared/widgets/error_state.dart';
import '../../../shared/widgets/empty_state.dart';
import '../../../navigation/route_names.dart';
import '../../../shared/l10n/app_localizations.dart';

class DocumentsScreen extends ConsumerWidget {
  const DocumentsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(documentNotifierProvider);
    final cache = ref.read(documentCacheServiceProvider);
    final cachedIds = cache.cachedIds;
    final theme = Theme.of(context);
    final dateFormat = DateFormat('dd.MM.yyyy', 'uk');

    return Scaffold(
      appBar: AppBar(
        title: Text(AppLocalizations.of(context)!.documents),
        leading: state.breadcrumb.isNotEmpty
            ? IconButton(
                icon: const Icon(Icons.arrow_back),
                onPressed: () =>
                    ref.read(documentNotifierProvider.notifier).navigateUp(),
              )
            : null,
        actions: [
          if (cachedIds.isNotEmpty)
            PopupMenuButton<String>(
              icon: const Icon(Icons.more_vert),
              onSelected: (value) async {
                if (value == 'clear_cache') {
                  final confirmed = await showDialog<bool>(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('Очистити кеш документів?'),
                      content: Text(
                        'Кешовано документів: ${cachedIds.length} '
                        '(${cache.totalCacheSizeFormatted})',
                      ),
                      actions: [
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, false),
                          child: const Text('Скасувати'),
                        ),
                        TextButton(
                          onPressed: () => Navigator.pop(ctx, true),
                          child: const Text('Очистити'),
                        ),
                      ],
                    ),
                  );
                  if (confirmed == true) {
                    await cache.clearAll();
                    if (context.mounted) {
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('Кеш документів очищено'),
                        ),
                      );
                      // Force rebuild to update cached indicators
                      ref
                          .read(documentNotifierProvider.notifier)
                          .loadDocuments();
                    }
                  }
                }
              },
              itemBuilder: (ctx) => [
                PopupMenuItem<String>(
                  value: 'clear_cache',
                  child: Row(
                    children: [
                      const Icon(Icons.delete_sweep, size: 20),
                      const SizedBox(width: 8),
                      Text(
                        'Очистити кеш (${cache.totalCacheSizeFormatted})',
                      ),
                    ],
                  ),
                ),
              ],
            ),
        ],
      ),
      floatingActionButton: FloatingActionButton(
        onPressed: () => _pickAndUpload(ref),
        child: const Icon(Icons.upload_file),
      ),
      body: Column(
        children: [
          // Breadcrumb
          if (state.breadcrumb.isNotEmpty)
            Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              color: theme.colorScheme.surfaceContainerHighest,
              child: Text(
                state.breadcrumb.join(' / '),
                style: theme.textTheme.bodySmall,
              ),
            ),

          // Upload progress
          ...state.uploads.values.map((upload) => Padding(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        const Icon(Icons.upload, size: 16),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(upload.fileName,
                              style: theme.textTheme.bodySmall),
                        ),
                        Text(
                          '${(upload.progress * 100).toInt()}%',
                          style: theme.textTheme.labelSmall,
                        ),
                      ],
                    ),
                    const SizedBox(height: 4),
                    LinearProgressIndicator(value: upload.progress),
                  ],
                ),
              )),

          // Content
          Expanded(
            child: state.isLoading
                ? const LoadingIndicator()
                : state.error != null
                    ? ErrorState(
                        message: state.error!,
                        onRetry: () => ref
                            .read(documentNotifierProvider.notifier)
                            .loadDocuments(),
                      )
                    : state.folders.isEmpty && state.documents.isEmpty
                        ? EmptyState(
                            icon: Icons.folder_open,
                            title: AppLocalizations.of(context)!.documentsEmpty,
                            subtitle: AppLocalizations.of(context)!.documentsEmptySubtitle,
                          )
                        : ListView(
                            children: [
                              // Folders
                              ...state.folders.map((folder) => ListTile(
                                    leading: Icon(Icons.folder,
                                        color: theme.colorScheme.primary),
                                    title: Text(folder.name),
                                    trailing:
                                        const Icon(Icons.chevron_right),
                                    onTap: () => ref
                                        .read(
                                            documentNotifierProvider.notifier)
                                        .navigateToFolder(folder),
                                  )),
                              if (state.folders.isNotEmpty &&
                                  state.documents.isNotEmpty)
                                const Divider(),
                              // Documents
                              ...state.documents.map((doc) => Dismissible(
                                    key: Key(doc.id),
                                    direction: DismissDirection.endToStart,
                                    background: Container(
                                      color: theme.colorScheme.error,
                                      alignment: Alignment.centerRight,
                                      padding:
                                          const EdgeInsets.only(right: 16),
                                      child: const Icon(Icons.delete,
                                          color: Colors.white),
                                    ),
                                    confirmDismiss: (_) async {
                                      return await showDialog<bool>(
                                        context: context,
                                        builder: (ctx) => AlertDialog(
                                          title:
                                              Text(AppLocalizations.of(context)!.documentDeleteConfirm),
                                          content: Text(doc.title),
                                          actions: [
                                            TextButton(
                                              onPressed: () =>
                                                  Navigator.pop(ctx, false),
                                              child:
                                                  Text(AppLocalizations.of(context)!.cancel),
                                            ),
                                            TextButton(
                                              onPressed: () =>
                                                  Navigator.pop(ctx, true),
                                              child:
                                                  Text(AppLocalizations.of(context)!.delete),
                                            ),
                                          ],
                                        ),
                                      );
                                    },
                                    onDismissed: (_) => ref
                                        .read(
                                            documentNotifierProvider.notifier)
                                        .deleteDocument(doc.id),
                                    child: ListTile(
                                      leading: Icon(
                                        _iconForType(doc.type),
                                        color: theme.colorScheme.primary,
                                      ),
                                      title: Text(
                                        doc.title,
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                      ),
                                      subtitle: Text(
                                        [
                                          doc.sizeFormatted,
                                          if (doc.uploadedAt != null)
                                            dateFormat.format(doc.uploadedAt!),
                                        ].where((s) => s.isNotEmpty).join(' · '),
                                        style: theme.textTheme.bodySmall,
                                      ),
                                      trailing: cachedIds.contains(doc.id)
                                          ? Tooltip(
                                              message: 'Збережено офлайн',
                                              child: Icon(
                                                Icons.download_done,
                                                size: 18,
                                                color: theme
                                                    .colorScheme
                                                    .primary
                                                    .withValues(alpha: 0.7),
                                              ),
                                            )
                                          : null,
                                      onTap: () => context.pushNamed(
                                        RouteNames.documentDetail,
                                        pathParameters: {'id': doc.id},
                                        extra: doc,
                                      ),
                                    ),
                                  )),
                            ],
                          ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickAndUpload(WidgetRef ref) async {
    final result = await FilePicker.platform.pickFiles(
      allowMultiple: true,
      type: FileType.custom,
      allowedExtensions: ['pdf', 'docx', 'doc', 'txt', 'html', 'rtf'],
    );

    if (result != null) {
      for (final file in result.files) {
        if (file.path != null) {
          ref.read(documentNotifierProvider.notifier).uploadFile(
                File(file.path!),
                file.name,
              );
        }
      }
    }
  }

  IconData _iconForType(String type) {
    if (type.contains('pdf')) return Icons.picture_as_pdf;
    if (type.contains('word') || type.contains('docx') || type.contains('doc')) {
      return Icons.description;
    }
    if (type.contains('text') || type.contains('txt')) return Icons.text_snippet;
    if (type.contains('html')) return Icons.code;
    return Icons.insert_drive_file;
  }
}
