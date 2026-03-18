import 'package:flutter/material.dart';
import '../data/models/document.dart';
import 'document_detail_screen.dart';
import '../../../shared/theme/app_colors.dart';

/// Full-screen pager that lets you swipe between documents.
class DocumentPagerScreen extends StatefulWidget {
  final List<VaultDocument> documents;
  final int initialIndex;

  const DocumentPagerScreen({
    super.key,
    required this.documents,
    required this.initialIndex,
  });

  @override
  State<DocumentPagerScreen> createState() => _DocumentPagerScreenState();
}

class _DocumentPagerScreenState extends State<DocumentPagerScreen> {
  late final PageController _pageController;
  late int _currentIndex;

  @override
  void initState() {
    super.initState();
    _currentIndex = widget.initialIndex;
    _pageController = PageController(initialPage: widget.initialIndex);
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Scaffold(
      appBar: AppBar(
        title: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              widget.documents[_currentIndex].title,
              style: theme.textTheme.titleSmall,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            Text(
              '${_currentIndex + 1} з ${widget.documents.length}',
              style: theme.textTheme.bodySmall?.copyWith(
                color: theme.colorScheme.onSurfaceVariant,
              ),
            ),
          ],
        ),
      ),
      body: Column(
        children: [
          // Page indicator
          _PageIndicator(
            total: widget.documents.length,
            current: _currentIndex,
          ),

          // Swipeable pages
          Expanded(
            child: PageView.builder(
              controller: _pageController,
              itemCount: widget.documents.length,
              onPageChanged: (index) {
                setState(() => _currentIndex = index);
              },
              itemBuilder: (context, index) {
                return DocumentDetailPage(
                  key: ValueKey(widget.documents[index].id),
                  document: widget.documents[index],
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _PageIndicator extends StatelessWidget {
  final int total;
  final int current;

  const _PageIndicator({required this.total, required this.current});

  @override
  Widget build(BuildContext context) {
    if (total <= 1) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(
            Icons.chevron_left,
            size: 16,
            color: current > 0
                ? AppColors.primary
                : AppColors.textSecondary.withValues(alpha: 0.3),
          ),
          const SizedBox(width: 8),
          // Show dots for small lists, text for large
          if (total <= 10)
            Row(
              mainAxisSize: MainAxisSize.min,
              children: List.generate(total, (i) {
                return Container(
                  width: i == current ? 16 : 6,
                  height: 6,
                  margin: const EdgeInsets.symmetric(horizontal: 2),
                  decoration: BoxDecoration(
                    color: i == current
                        ? AppColors.primary
                        : AppColors.border,
                    borderRadius: BorderRadius.circular(3),
                  ),
                );
              }),
            )
          else
            Text(
              '${current + 1} / $total',
              style: TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppColors.textSecondary,
              ),
            ),
          const SizedBox(width: 8),
          Icon(
            Icons.chevron_right,
            size: 16,
            color: current < total - 1
                ? AppColors.primary
                : AppColors.textSecondary.withValues(alpha: 0.3),
          ),
        ],
      ),
    );
  }
}
