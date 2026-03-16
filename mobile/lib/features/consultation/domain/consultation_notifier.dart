import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/di/service_locator.dart';
import '../data/consultation_repository.dart';
import '../data/models/consultation_message.dart';
import 'consultation_state.dart';

final consultationRepositoryProvider =
    Provider<ConsultationRepository>((ref) {
  return ConsultationRepository(api: sl.apiClient, sse: sl.sseClient);
});

// List of consultations
final consultationListProvider =
    NotifierProvider<ConsultationListNotifier, ConsultationState>(
        ConsultationListNotifier.new);

class ConsultationListNotifier extends Notifier<ConsultationState> {
  late final ConsultationRepository _repo;

  @override
  ConsultationState build() {
    _repo = ref.read(consultationRepositoryProvider);
    return const ConsultationState();
  }

  Future<void> loadConsultations() async {
    state = state.copyWith(isLoadingConsultations: true);
    try {
      final consultations = await _repo.getConsultations();
      state = state.copyWith(
        consultations: consultations,
        isLoadingConsultations: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingConsultations: false,
        error: e.toString(),
      );
    }
  }
}

// Individual consultation chat
final consultationChatProvider = NotifierProvider.family<
    ConsultationChatNotifier,
    ConsultationChatState,
    String>(ConsultationChatNotifier.new);

class ConsultationChatNotifier
    extends FamilyNotifier<ConsultationChatState, String> {
  late final ConsultationRepository _repo;
  StreamSubscription? _subscription;

  @override
  ConsultationChatState build(String consultationId) {
    _repo = ref.read(consultationRepositoryProvider);
    ref.onDispose(() => _subscription?.cancel());
    return ConsultationChatState(consultationId: consultationId);
  }

  Future<void> loadMessages() async {
    state = state.copyWith(isLoading: true);
    try {
      final messages = await _repo.getMessages(arg);
      state = state.copyWith(messages: messages, isLoading: false);
      _startStream();
      _repo.markAsRead(arg);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  Future<void> _startStream() async {
    _subscription = await _repo.streamMessages(
      consultationId: arg,
      onMessage: (message) {
        // Dedupe: replace optimistic message or add new
        final existing = state.messages.indexWhere((m) => m.id == message.id);
        if (existing >= 0) {
          final updated = List<ConsultationMessage>.from(state.messages);
          updated[existing] = message;
          state = state.copyWith(messages: updated);
        } else {
          state = state.copyWith(
              messages: [...state.messages, message]);
        }
      },
      onDone: () {},
      onError: (error) {
        state = state.copyWith(error: error.toString());
      },
    );
  }

  Future<void> sendMessage(String content) async {
    if (content.trim().isEmpty) return;

    // Optimistic insert
    final optimistic = ConsultationMessage(
      id: 'temp_${DateTime.now().millisecondsSinceEpoch}',
      consultationId: arg,
      senderId: 'me',
      senderName: '',
      content: content.trim(),
      status: 'sending',
      createdAt: DateTime.now(),
    );

    state = state.copyWith(messages: [...state.messages, optimistic]);

    try {
      final sent = await _repo.sendMessage(arg, content.trim());
      // Replace optimistic with real message
      final updated = state.messages.map((m) {
        if (m.id == optimistic.id) return sent;
        return m;
      }).toList();
      state = state.copyWith(messages: updated);
    } catch (e) {
      // Mark optimistic as failed
      final updated = state.messages.map((m) {
        if (m.id == optimistic.id) {
          return m.copyWith(status: 'failed');
        }
        return m;
      }).toList();
      state = state.copyWith(messages: updated, error: e.toString());
    }
  }
}
