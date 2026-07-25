import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/consultation/data/models/consultation.dart';
import 'package:secondlayer_mobile/features/consultation/data/models/consultation_message.dart';
import 'package:secondlayer_mobile/features/consultation/domain/consultation_state.dart';

void main() {
  group('ConsultationState', () {
    test('default values', () {
      const state = ConsultationState();

      expect(state.consultations, isEmpty);
      expect(state.isLoadingConsultations, false);
      expect(state.payouts, isEmpty);
      expect(state.isLoadingPayouts, false);
      expect(state.error, isNull);
    });

    test('copyWith updates consultations', () {
      const state = ConsultationState();
      final consultation = Consultation.fromJson({
        'id': 'c1',
        'title': 'Test',
        'created_at': '2025-01-01T10:00:00Z',
        'updated_at': '2025-01-01T10:00:00Z',
      });

      final updated = state.copyWith(consultations: [consultation]);

      expect(updated.consultations.length, 1);
      expect(updated.consultations[0].id, 'c1');
    });

    test('copyWith updates isLoadingConsultations', () {
      const state = ConsultationState();

      final updated = state.copyWith(isLoadingConsultations: true);

      expect(updated.isLoadingConsultations, true);
    });

    test('copyWith updates payouts', () {
      const state = ConsultationState();
      final payout = AttorneyPayout.fromJson({
        'id': 'p1',
        'attorney_user_id': 'u1',
        'amount_uah': 500,
        'status': 'paid',
        'created_at': '2025-01-01T10:00:00Z',
      });

      final updated = state.copyWith(payouts: [payout]);

      expect(updated.payouts.length, 1);
      expect(updated.payouts[0].id, 'p1');
    });

    test('copyWith updates isLoadingPayouts', () {
      const state = ConsultationState();

      final updated = state.copyWith(isLoadingPayouts: true);

      expect(updated.isLoadingPayouts, true);
    });

    test('copyWith updates error', () {
      const state = ConsultationState();

      final updated = state.copyWith(error: 'Something went wrong');

      expect(updated.error, 'Something went wrong');
    });

    test('copyWith clearError removes error', () {
      final state = const ConsultationState().copyWith(error: 'Error');

      final updated = state.copyWith(clearError: true);

      expect(updated.error, isNull);
    });

    test('copyWith preserves fields not specified', () {
      final state = const ConsultationState().copyWith(
        isLoadingConsultations: true,
        isLoadingPayouts: true,
        error: 'Error',
      );

      final updated = state.copyWith(isLoadingConsultations: false);

      expect(updated.isLoadingConsultations, false);
      expect(updated.isLoadingPayouts, true);
      expect(updated.error, 'Error');
    });
  });

  group('ConsultationChatState', () {
    test('default values', () {
      const state = ConsultationChatState(consultationId: 'c1');

      expect(state.consultationId, 'c1');
      expect(state.messages, isEmpty);
      expect(state.isLoading, false);
      expect(state.typingUserName, isNull);
      expect(state.savedAttachmentMessageIds, isEmpty);
      expect(state.error, isNull);
    });

    test('copyWith updates messages', () {
      const state = ConsultationChatState(consultationId: 'c1');
      final message = ConsultationMessage(
        id: 'm1',
        consultationId: 'c1',
        senderId: 's1',
        senderName: 'Test',
        content: 'Hello',
        createdAt: DateTime(2025, 1, 1),
      );

      final updated = state.copyWith(messages: [message]);

      expect(updated.messages.length, 1);
      expect(updated.messages[0].id, 'm1');
    });

    test('copyWith updates isLoading', () {
      const state = ConsultationChatState(consultationId: 'c1');

      final updated = state.copyWith(isLoading: true);

      expect(updated.isLoading, true);
    });

    test('copyWith updates typingUserName', () {
      const state = ConsultationChatState(consultationId: 'c1');

      final updated = state.copyWith(typingUserName: 'Олена');

      expect(updated.typingUserName, 'Олена');
    });

    test('copyWith clearTyping removes typingUserName', () {
      final state = const ConsultationChatState(consultationId: 'c1')
          .copyWith(typingUserName: 'Олена');

      final updated = state.copyWith(clearTyping: true);

      expect(updated.typingUserName, isNull);
    });

    test('copyWith updates savedAttachmentMessageIds', () {
      const state = ConsultationChatState(consultationId: 'c1');

      final updated =
          state.copyWith(savedAttachmentMessageIds: {'m1', 'm2'});

      expect(updated.savedAttachmentMessageIds, {'m1', 'm2'});
    });

    test('copyWith updates error', () {
      const state = ConsultationChatState(consultationId: 'c1');

      final updated = state.copyWith(error: 'Network error');

      expect(updated.error, 'Network error');
    });

    test('copyWith clearError removes error', () {
      final state = const ConsultationChatState(consultationId: 'c1')
          .copyWith(error: 'Error');

      final updated = state.copyWith(clearError: true);

      expect(updated.error, isNull);
    });

    test('copyWith preserves consultationId', () {
      const state = ConsultationChatState(consultationId: 'c1');

      final updated = state.copyWith(isLoading: true);

      expect(updated.consultationId, 'c1');
    });

    test('copyWith preserves fields not specified', () {
      final state = const ConsultationChatState(consultationId: 'c1')
          .copyWith(
        isLoading: true,
        typingUserName: 'User',
        savedAttachmentMessageIds: {'m1'},
        error: 'Error',
      );

      final updated = state.copyWith(isLoading: false);

      expect(updated.isLoading, false);
      expect(updated.typingUserName, 'User');
      expect(updated.savedAttachmentMessageIds, {'m1'});
      expect(updated.error, 'Error');
    });

    test('clearTyping takes priority over typingUserName', () {
      const state = ConsultationChatState(consultationId: 'c1');

      // When both clearTyping and typingUserName are set, clearTyping wins
      final updated =
          state.copyWith(typingUserName: 'Test', clearTyping: true);

      expect(updated.typingUserName, isNull);
    });
  });
}
