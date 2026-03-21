import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/consultation/data/models/consultation.dart';
import 'package:secondlayer_mobile/features/consultation/data/models/consultation_message.dart';

// Repository tests that verify model parsing from API-like responses
// These are integration-level model tests using realistic API response shapes

void main() {
  group('ConsultationRepository model parsing', () {
    test('parses consultation list response', () {
      final responseData = [
        {
          'id': 'c1',
          'request_title': 'Земельна справа',
          'client_name': 'Іван Петренко',
          'attorney_name': 'Олена Коваль',
          'client_user_id': 'u1',
          'attorney_user_id': 'u2',
          'status': 'active',
          'agreed_fee_uah': 500,
          'created_at': '2025-01-01T10:00:00Z',
          'updated_at': '2025-01-02T12:00:00Z',
          'unread_count': 2,
        },
        {
          'id': 'c2',
          'request_title': 'Трудовий спір',
          'client_name': 'Марія Іваненко',
          'status': 'pending',
          'created_at': '2025-01-03T10:00:00Z',
          'updated_at': '2025-01-03T10:00:00Z',
          'unread_count': 0,
        },
      ];

      final consultations = responseData
          .map((e) => Consultation.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(consultations.length, 2);
      expect(consultations[0].title, 'Земельна справа');
      expect(consultations[0].agreedFeeUah, 500.0);
      expect(consultations[0].unreadCount, 2);
      expect(consultations[1].title, 'Трудовий спір');
      expect(consultations[1].attorneyName, isNull);
    });

    test('parses messages list response', () {
      final responseData = [
        {
          'id': 'm1',
          'consultation_id': 'c1',
          'sender_id': 'u1',
          'sender_name': 'Іван',
          'content': 'Доброго дня',
          'status': 'read',
          'created_at': '2025-01-01T10:00:00Z',
          'attachments': [],
        },
        {
          'id': 'm2',
          'consultation_id': 'c1',
          'sender_id': 'u2',
          'sender_name': 'Олена',
          'content': 'Вітаю! Чим можу допомогти?',
          'status': 'delivered',
          'created_at': '2025-01-01T10:05:00Z',
          'attachments': [
            {
              'id': 'a1',
              'name': 'contract.pdf',
              'type': 'file',
              'url': 'https://example.com/contract.pdf',
              'size': 4096,
            },
          ],
        },
      ];

      final messages = responseData
          .map((e) => ConsultationMessage.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(messages.length, 2);
      expect(messages[0].content, 'Доброго дня');
      expect(messages[0].status, 'read');
      expect(messages[1].attachments.length, 1);
      expect(messages[1].attachments[0].name, 'contract.pdf');
    });

    test('parses payouts list response', () {
      final responseData = [
        {
          'id': 'ap1',
          'attorney_user_id': 'u2',
          'consultation_payment_id': 'p1',
          'amount_uah': 450.0,
          'status': 'paid',
          'created_at': '2025-01-05T10:00:00Z',
          'consultation_id': 'c1',
          'request_title': 'Земельна справа',
        },
        {
          'id': 'ap2',
          'attorney_user_id': 'u2',
          'amount_uah': 800.0,
          'status': 'pending',
          'created_at': '2025-01-06T10:00:00Z',
          'consultation_id': 'c3',
          'request_title': 'Сімейна справа',
        },
      ];

      final payouts = responseData
          .map((e) => AttorneyPayout.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(payouts.length, 2);
      expect(payouts[0].amountUah, 450.0);
      expect(payouts[0].status, 'paid');
      expect(payouts[0].requestTitle, 'Земельна справа');
      expect(payouts[1].amountUah, 800.0);
      expect(payouts[1].status, 'pending');
    });

    test('parses payment status response', () {
      final responseData = {
        'id': 'p1',
        'consultation_id': 'c1',
        'amount_uah': 500.0,
        'platform_fee_uah': 50.0,
        'attorney_payout_uah': 450.0,
        'status': 'completed',
        'payment_provider': 'monobank',
        'created_at': '2025-01-04T10:00:00Z',
      };

      final payment = ConsultationPayment.fromJson(responseData);

      expect(payment.id, 'p1');
      expect(payment.amountUah, 500.0);
      expect(payment.platformFeeUah, 50.0);
      expect(payment.attorneyPayoutUah, 450.0);
      expect(payment.status, 'completed');
    });

    test('handles empty consultation list', () {
      final responseData = <dynamic>[];

      final consultations = responseData
          .map((e) => Consultation.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(consultations, isEmpty);
    });

    test('handles empty messages list', () {
      final responseData = <dynamic>[];

      final messages = responseData
          .map((e) => ConsultationMessage.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(messages, isEmpty);
    });

    test('handles empty payouts list', () {
      final responseData = <dynamic>[];

      final payouts = responseData
          .map((e) => AttorneyPayout.fromJson(e as Map<String, dynamic>))
          .toList();

      expect(payouts, isEmpty);
    });

    test('consultation with all statuses', () {
      final statuses = [
        'pending',
        'accepted',
        'active',
        'completed',
        'declined',
        'cancelled',
      ];

      for (final status in statuses) {
        final json = {
          'id': 'c_$status',
          'title': 'Test $status',
          'status': status,
          'created_at': '2025-01-01T10:00:00Z',
          'updated_at': '2025-01-01T10:00:00Z',
        };

        final c = Consultation.fromJson(json);
        expect(c.status, status);
      }
    });

    test('message with all statuses', () {
      final statuses = ['sending', 'sent', 'delivered', 'read', 'failed'];

      for (final status in statuses) {
        final json = {
          'id': 'm_$status',
          'consultation_id': 'c1',
          'sender_id': 's1',
          'sender_name': 'Test',
          'content': 'Hello',
          'status': status,
          'created_at': '2025-01-01T10:00:00Z',
        };

        final m = ConsultationMessage.fromJson(json);
        expect(m.status, status);
      }
    });

    test('payout totals calculation', () {
      final payoutsData = [
        {'id': 'p1', 'attorney_user_id': 'u1', 'amount_uah': 100, 'status': 'paid', 'created_at': '2025-01-01T10:00:00Z'},
        {'id': 'p2', 'attorney_user_id': 'u1', 'amount_uah': 200, 'status': 'paid', 'created_at': '2025-01-01T10:00:00Z'},
        {'id': 'p3', 'attorney_user_id': 'u1', 'amount_uah': 300, 'status': 'pending', 'created_at': '2025-01-01T10:00:00Z'},
      ];

      final payouts = payoutsData
          .map((e) => AttorneyPayout.fromJson(e))
          .toList();

      final totalAmount = payouts.fold<double>(0, (sum, p) => sum + p.amountUah);
      final paidAmount = payouts
          .where((p) => p.status == 'paid')
          .fold<double>(0, (sum, p) => sum + p.amountUah);
      final pendingAmount = payouts
          .where((p) => p.status == 'pending')
          .fold<double>(0, (sum, p) => sum + p.amountUah);

      expect(totalAmount, 600.0);
      expect(paidAmount, 300.0);
      expect(pendingAmount, 300.0);
    });
  });
}
