import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import '../domain/consultation_notifier.dart';

class ConsultationCreateScreen extends ConsumerStatefulWidget {
  const ConsultationCreateScreen({super.key});

  @override
  ConsumerState<ConsultationCreateScreen> createState() =>
      _ConsultationCreateScreenState();
}

class _ConsultationCreateScreenState
    extends ConsumerState<ConsultationCreateScreen> {
  final _formKey = GlobalKey<FormState>();
  final _titleController = TextEditingController();
  final _descriptionController = TextEditingController();
  String _type = 'consultation';
  String _urgency = 'normal';
  bool _isSubmitting = false;

  static const _types = {
    'consultation': 'Консультація',
    'representation': 'Представництво',
    'document_analysis': 'Аналіз документів',
  };

  static const _urgencies = {
    'normal': 'Звичайна',
    'high': 'Висока',
    'urgent': 'Термінова',
  };

  @override
  void dispose() {
    _titleController.dispose();
    _descriptionController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() => _isSubmitting = true);

    try {
      final repo = ref.read(consultationRepositoryProvider);
      final consultation = await repo.createConsultation({
        'request_title': _titleController.text.trim(),
        'request_description': _descriptionController.text.trim(),
        'type': _type,
        'urgency': _urgency,
      });

      if (mounted) {
        context.go('/consultations/${consultation.id}/detail');
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Помилка: ${e.toString()}')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSubmitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {

    return Scaffold(
      appBar: AppBar(
        title: const Text('Новий запит'),
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              TextFormField(
                controller: _titleController,
                decoration: const InputDecoration(
                  labelText: 'Заголовок',
                  hintText: 'Коротко опишіть запит',
                ),
                validator: (v) =>
                    (v == null || v.trim().isEmpty) ? 'Обов\'язкове поле' : null,
              ),
              const SizedBox(height: 16),
              TextFormField(
                controller: _descriptionController,
                maxLines: 4,
                decoration: const InputDecoration(
                  labelText: 'Опис',
                  hintText: 'Детальний опис (необов\'язково)',
                ),
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _type,
                decoration: const InputDecoration(labelText: 'Тип'),
                items: _types.entries
                    .map((e) => DropdownMenuItem(
                          value: e.key,
                          child: Text(e.value),
                        ))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _type = v);
                },
              ),
              const SizedBox(height: 16),
              DropdownButtonFormField<String>(
                value: _urgency,
                decoration: const InputDecoration(labelText: 'Терміновість'),
                items: _urgencies.entries
                    .map((e) => DropdownMenuItem(
                          value: e.key,
                          child: Text(e.value),
                        ))
                    .toList(),
                onChanged: (v) {
                  if (v != null) setState(() => _urgency = v);
                },
              ),
              const SizedBox(height: 32),
              SizedBox(
                width: double.infinity,
                child: FilledButton(
                  onPressed: _isSubmitting ? null : _submit,
                  child: _isSubmitting
                      ? const SizedBox(
                          width: 20,
                          height: 20,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : const Text('Створити запит'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
