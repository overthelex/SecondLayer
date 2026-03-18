import 'dart:io';
import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import 'package:flutter_pdfview/flutter_pdfview.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';
import 'package:dio/dio.dart';
import 'package:path_provider/path_provider.dart';
import '../domain/document_notifier.dart';
import '../data/models/document.dart';
import '../../../shared/theme/app_colors.dart';

/// Standalone screen with AppBar — used when opening a single document.
class DocumentDetailScreen extends ConsumerWidget {
  final VaultDocument document;

  const DocumentDetailScreen({super.key, required this.document});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      appBar: AppBar(
        title: Text(
          document.title,
          style: Theme.of(context).textTheme.titleSmall,
          maxLines: 1,
          overflow: TextOverflow.ellipsis,
        ),
      ),
      body: DocumentDetailPage(document: document),
    );
  }
}

/// Content-only widget — works inside PageView or standalone Scaffold.
class DocumentDetailPage extends ConsumerStatefulWidget {
  final VaultDocument document;

  const DocumentDetailPage({super.key, required this.document});

  @override
  ConsumerState<DocumentDetailPage> createState() =>
      _DocumentDetailPageState();
}

class _DocumentDetailPageState extends ConsumerState<DocumentDetailPage>
    with AutomaticKeepAliveClientMixin {
  bool _isLoading = true;
  String? _textContent;
  DocumentPreview? _preview;
  String? _pdfLocalPath;
  int _pdfPages = 0;
  int _pdfCurrentPage = 0;
  String? _error;

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    _loadContent();
  }

  Future<void> _loadContent() async {
    setState(() {
      _isLoading = true;
      _error = null;
    });

    final repo = ref.read(documentRepositoryProvider);

    try {
      final preview = await repo.getDocumentPreview(widget.document.id);
      _preview = preview;

      if (preview.hasPreview && preview.isPdf) {
        // Download PDF to local temp file for rendering
        await _downloadPdf(preview.previewUrl!);
      } else if (!preview.hasPreview) {
        final text = await repo.getDocumentText(widget.document.id);
        _textContent = text;
      }

      setState(() => _isLoading = false);
    } catch (e) {
      try {
        final text = await repo.getDocumentText(widget.document.id);
        _textContent = text;
        setState(() => _isLoading = false);
      } catch (e2) {
        setState(() {
          _isLoading = false;
          _error = e2.toString().replaceFirst('Exception: ', '');
        });
      }
    }
  }

  Future<void> _downloadPdf(String url) async {
    try {
      final dir = await getTemporaryDirectory();
      final filePath =
          '${dir.path}/doc_${widget.document.id.hashCode}.pdf';

      // Skip download if already cached
      if (File(filePath).existsSync()) {
        _pdfLocalPath = filePath;
        return;
      }

      await Dio().download(url, filePath);
      _pdfLocalPath = filePath;
    } catch (e) {
      // PDF download failed — fallback to open in browser
      _pdfLocalPath = null;
    }
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final theme = Theme.of(context);

    if (_isLoading) {
      return const Center(child: CircularProgressIndicator());
    }

    if (_error != null) {
      return _buildError(theme);
    }

    return _buildContent(theme);
  }

  Widget _buildError(ThemeData theme) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const Icon(Icons.error_outline, size: 48, color: AppColors.error),
            const SizedBox(height: 12),
            Text(
              _error!,
              style: theme.textTheme.bodyMedium,
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 16),
            ElevatedButton.icon(
              onPressed: _loadContent,
              icon: const Icon(Icons.refresh),
              label: const Text('Спробувати знову'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContent(ThemeData theme) {
    // PDF — inline viewer
    if (_preview?.isPdf == true && _pdfLocalPath != null) {
      return Column(
        children: [
          // Page counter
          if (_pdfPages > 0)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 6),
              child: Text(
                'Сторінка ${_pdfCurrentPage + 1} з $_pdfPages',
                style: theme.textTheme.bodySmall?.copyWith(
                  color: theme.colorScheme.onSurfaceVariant,
                ),
              ),
            ),
          Expanded(
            child: PDFView(
              filePath: _pdfLocalPath!,
              enableSwipe: true,
              swipeHorizontal: false,
              autoSpacing: true,
              pageFling: true,
              pageSnap: true,
              fitPolicy: FitPolicy.WIDTH,
              onRender: (pages) {
                setState(() => _pdfPages = pages ?? 0);
              },
              onPageChanged: (page, total) {
                setState(() => _pdfCurrentPage = page ?? 0);
              },
              onError: (error) {
                setState(() {
                  _pdfLocalPath = null;
                  _error = 'Не вдалось відобразити PDF: $error';
                });
              },
            ),
          ),
          // Open in browser fallback button
          Padding(
            padding: const EdgeInsets.all(8),
            child: TextButton.icon(
              onPressed: () => _openInBrowser(_preview!.previewUrl!),
              icon: const Icon(Icons.open_in_browser, size: 16),
              label: const Text('Відкрити у браузері'),
            ),
          ),
        ],
      );
    }

    // PDF without local file — fallback to browser
    if (_preview?.isPdf == true && _preview?.hasPreview == true) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(Icons.picture_as_pdf,
                  size: 64, color: theme.colorScheme.primary),
              const SizedBox(height: 16),
              Text(
                widget.document.title,
                style: theme.textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 24),
              ElevatedButton.icon(
                onPressed: () => _openInBrowser(_preview!.previewUrl!),
                icon: const Icon(Icons.open_in_browser),
                label: const Text('Відкрити PDF'),
              ),
            ],
          ),
        ),
      );
    }

    // Image preview
    if (_preview?.hasPreview == true && _preview!.isImage) {
      return InteractiveViewer(
        child: Center(
          child: Image.network(
            _preview!.previewUrl!,
            fit: BoxFit.contain,
            loadingBuilder: (_, child, progress) {
              if (progress == null) return child;
              return Center(
                child: CircularProgressIndicator(
                  value: progress.expectedTotalBytes != null
                      ? progress.cumulativeBytesLoaded /
                          progress.expectedTotalBytes!
                      : null,
                ),
              );
            },
            errorBuilder: (_, __, ___) => Column(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.broken_image, size: 48),
                const SizedBox(height: 8),
                const Text('Не вдалось завантажити зображення'),
                TextButton(
                  onPressed: () => _openInBrowser(_preview!.previewUrl!),
                  child: const Text('Відкрити у браузері'),
                ),
              ],
            ),
          ),
        ),
      );
    }

    // Text content
    if (_textContent != null && _textContent!.isNotEmpty) {
      return SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(
                color: theme.colorScheme.surfaceContainerHighest,
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  Icon(_iconForType(widget.document.type),
                      size: 20, color: theme.colorScheme.primary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      widget.document.title,
                      style: theme.textTheme.labelLarge,
                    ),
                  ),
                  if (widget.document.sizeFormatted.isNotEmpty)
                    Text(
                      widget.document.sizeFormatted,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: theme.colorScheme.onSurfaceVariant,
                      ),
                    ),
                ],
              ),
            ),
            const SizedBox(height: 16),
            MarkdownBody(
              data: _textContent!,
              selectable: true,
            ),
          ],
        ),
      );
    }

    return const Center(child: Text('Документ порожній'));
  }

  Future<void> _openInBrowser(String url) async {
    final uri = Uri.parse(url);
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
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
