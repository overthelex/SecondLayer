import 'package:flutter/material.dart';

class ConsultationInput extends StatefulWidget {
  final ValueChanged<String> onSend;

  const ConsultationInput({super.key, required this.onSend});

  @override
  State<ConsultationInput> createState() => _ConsultationInputState();
}

class _ConsultationInputState extends State<ConsultationInput> {
  final _controller = TextEditingController();

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Container(
      padding: EdgeInsets.only(
        left: 12,
        right: 12,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      decoration: BoxDecoration(
        color: theme.colorScheme.surface,
        border: Border(
          top: BorderSide(
            color: theme.colorScheme.outline.withValues(alpha: 0.2),
          ),
        ),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          // Attachment button
          IconButton(
            onPressed: () {
              // TODO: implement file/image picker
            },
            icon: const Icon(Icons.attach_file, size: 20),
            style: IconButton.styleFrom(
              foregroundColor: theme.colorScheme.onSurfaceVariant,
              padding: const EdgeInsets.all(8),
              minimumSize: const Size(36, 36),
            ),
          ),

          // Text field
          Expanded(
            child: TextField(
              controller: _controller,
              maxLines: 4,
              minLines: 1,
              textInputAction: TextInputAction.newline,
              decoration: InputDecoration(
                hintText: 'Написати повідомлення...',
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(24),
                ),
                contentPadding: const EdgeInsets.symmetric(
                  horizontal: 16,
                  vertical: 10,
                ),
              ),
            ),
          ),
          const SizedBox(width: 8),

          // Send button
          IconButton.filled(
            onPressed: () {
              final text = _controller.text.trim();
              if (text.isEmpty) return;
              widget.onSend(text);
              _controller.clear();
            },
            icon: const Icon(Icons.send),
          ),
        ],
      ),
    );
  }
}
