import 'dart:async';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/di/service_locator.dart';
import '../../../core/network/sse_client.dart';
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

  Future<void> loadPayouts() async {
    state = state.copyWith(isLoadingPayouts: true);
    try {
      final payouts = await _repo.getMyPayouts();
      state = state.copyWith(
        payouts: payouts,
        isLoadingPayouts: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoadingPayouts: false,
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
  Timer? _pollingTimer;
  Timer? _typingDebounce;
  Timer? _typingClearTimer;

  @override
  ConsultationChatState build(String consultationId) {
    _repo = ref.read(consultationRepositoryProvider);
    ref.onDispose(() {
      _subscription?.cancel();
      _pollingTimer?.cancel();
      _typingDebounce?.cancel();
      _typingClearTimer?.cancel();
    });
    return ConsultationChatState(consultationId: consultationId);
  }

  Future<void> loadMessages() async {
    state = state.copyWith(isLoading: true);
    try {
      final messages = await _repo.getMessages(arg);
      state = state.copyWith(messages: messages, isLoading: false);
      _startStream();
      _startPolling();
      _repo.markAsRead(arg);
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void _startPolling() {
    _pollingTimer?.cancel();
    _pollingTimer = Timer.periodic(const Duration(seconds: 5), (_) async {
      try {
        final messages = await _repo.getMessages(arg);
        // Merge: keep optimistic messages, update existing, add new
        final merged = <ConsultationMessage>[];
        final existingIds = <String>{};
        for (final m in messages) {
          merged.add(m);
          existingIds.add(m.id);
        }
        // Keep optimistic (temp_*) messages that haven't been replaced
        for (final m in state.messages) {
          if (m.id.startsWith('temp_') && !existingIds.contains(m.id)) {
            merged.add(m);
          }
        }
        state = state.copyWith(messages: merged);
      } catch (_) {
        // Silently ignore polling errors
      }
    });
  }

  Future<void> _startStream() async {
    _subscription = await _repo.streamMessages(
      consultationId: arg,
      onEvent: (SSEEvent event) {
        _handleSSEEvent(event);
      },
      onDone: () {},
      onError: (error) {
        state = state.copyWith(error: error.toString());
      },
    );
  }

  void _handleSSEEvent(SSEEvent event) {
    switch (event.event) {
      case 'message':
        if (event.data is Map<String, dynamic>) {
          final message = ConsultationMessage.fromJson(
              event.data as Map<String, dynamic>);
          _upsertMessage(message);
        }
        break;
      case 'message_status':
        if (event.data is Map<String, dynamic>) {
          final data = event.data as Map<String, dynamic>;
          final messageId = data['message_id'] as String?;
          final newStatus = data['status'] as String?;
          if (messageId != null && newStatus != null) {
            final updated = state.messages.map((m) {
              if (m.id == messageId) return m.copyWith(status: newStatus);
              return m;
            }).toList();
            state = state.copyWith(messages: updated);
          }
        }
        break;
      case 'typing':
        if (event.data is Map<String, dynamic>) {
          final data = event.data as Map<String, dynamic>;
          final userName = data['user_name'] as String?;
          state = state.copyWith(typingUserName: userName);
          _typingClearTimer?.cancel();
          _typingClearTimer = Timer(const Duration(seconds: 4), () {
            state = state.copyWith(clearTyping: true);
          });
        }
        break;
      case 'consultation_status':
        // Refresh consultation data
        _repo.getConsultation(arg).then((_) {
          // Status changes handled by list screen refresh
        }).catchError((_) {});
        break;
    }
  }

  void _upsertMessage(ConsultationMessage message) {
    final existing = state.messages.indexWhere((m) => m.id == message.id);
    if (existing >= 0) {
      final updated = List<ConsultationMessage>.from(state.messages);
      updated[existing] = message;
      state = state.copyWith(messages: updated);
    } else {
      state = state.copyWith(messages: [...state.messages, message]);
    }
  }

  void onTyping() {
    _typingDebounce?.cancel();
    _typingDebounce = Timer(const Duration(seconds: 3), () {
      _repo.sendTyping(arg).catchError((_) {});
    });
  }

  Future<void> saveAttachmentToVault({
    required String messageId,
    required String attachmentId,
  }) async {
    try {
      await _repo.saveAttachmentToVault(
        consultationId: arg,
        messageId: messageId,
        attachmentId: attachmentId,
      );
      state = state.copyWith(
        savedAttachmentMessageIds: {
          ...state.savedAttachmentMessageIds,
          messageId,
        },
      );
    } catch (e) {
      state = state.copyWith(error: e.toString());
    }
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
