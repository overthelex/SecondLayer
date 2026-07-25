import 'package:flutter/material.dart';
import 'package:flutter_markdown/flutter_markdown.dart';
import '../../../../shared/theme/app_colors.dart';

class DocumentViewerScreen extends StatefulWidget {
  final String documentId;
  final String title;

  const DocumentViewerScreen({
    super.key,
    required this.documentId,
    required this.title,
  });

  @override
  State<DocumentViewerScreen> createState() => _DocumentViewerScreenState();
}

class _DocumentViewerScreenState extends State<DocumentViewerScreen> {
  bool _isLoading = true;
  String _content = '';
  String? _error;

  @override
  void initState() {
    super.initState();
    _loadDocument();
  }

  Future<void> _loadDocument() async {
    // TODO: Load document content from API
    // For now, show placeholder
    setState(() {
      _isLoading = false;
      _content = 'Завантаження документа...';
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Text(
          widget.title,
          style: theme.textTheme.titleMedium,
        ),
      ),
      body: _isLoading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.error_outline,
                          size: 48, color: AppColors.error),
                      const SizedBox(height: 12),
                      Text(_error!,
                          style: theme.textTheme.bodyMedium,
                          textAlign: TextAlign.center),
                      const SizedBox(height: 12),
                      ElevatedButton(
                        onPressed: _loadDocument,
                        child: const Text('Спробувати знову'),
                      ),
                    ],
                  ),
                )
              : SingleChildScrollView(
                  padding: const EdgeInsets.all(16),
                  child: MarkdownBody(
                    data: _content,
                    selectable: true,
                  ),
                ),
    );
  }
}
