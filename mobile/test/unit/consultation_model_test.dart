import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/consultation/data/models/consultation.dart';

void main() {
  group('Consultation', () {
    test('fromJson parses all fields correctly', () {
      final json = {
        'id': 'c1',
        'request_title': 'Земельна справа',
        'client_name': 'Іван',
        'attorney_name': 'Олена',
        'client_user_id': 'u1',
        'attorney_user_id': 'u2',
        'status': 'active',
        'request_description': 'Потрібна консультація',
        'agreed_fee_uah': 500.0,
        'document_ids': ['d1', 'd2'],
        'decline_reason': null,
        'cancel_reason': null,
        'created_at': '2025-01-01T10:00:00Z',
        'updated_at': '2025-01-02T12:00:00Z',
        'unread_count': 3,
      };

      final c = Consultation.fromJson(json);

      expect(c.id, 'c1');
      expect(c.title, 'Земельна справа');
      expect(c.clientName, 'Іван');
      expect(c.attorneyName, 'Олена');
      expect(c.clientUserId, 'u1');
      expect(c.attorneyUserId, 'u2');
      expect(c.status, 'active');
      expect(c.requestDescription, 'Потрібна консультація');
      expect(c.agreedFeeUah, 500.0);
      expect(c.documentIds, ['d1', 'd2']);
      expect(c.declineReason, isNull);
      expect(c.cancelReason, isNull);
      expect(c.unreadCount, 3);
    });

    test('fromJson uses request_title fallback to title', () {
      final json = {
        'id': 'c2',
        'title': 'Fallback Title',
        'created_at': '2025-01-01T10:00:00Z',
        'updated_at': '2025-01-01T10:00:00Z',
      };

      final c = Consultation.fromJson(json);
      expect(c.title, 'Fallback Title');
    });

    test('fromJson request_title takes priority over title', () {
      final json = {
        'id': 'c3',
        'request_title': 'Primary',
        'title': 'Secondary',
        'created_at': '2025-01-01T10:00:00Z',
        'updated_at': '2025-01-01T10:00:00Z',
      };

      final c = Consultation.fromJson(json);
      expect(c.title, 'Primary');
    });

    test('fromJson handles missing fields with defaults', () {
      final json = <String, dynamic>{};

      final c = Consultation.fromJson(json);

      expect(c.id, '');
      expect(c.title, '');
      expect(c.clientName, isNull);
      expect(c.attorneyName, isNull);
      expect(c.status, 'pending');
      expect(c.agreedFeeUah, isNull);
      expect(c.documentIds, isEmpty);
      expect(c.unreadCount, 0);
    });

    test('fromJson parses numeric fee from int', () {
      final json = {
        'id': 'c4',
        'agreed_fee_uah': 1000,
        'created_at': '2025-01-01T10:00:00Z',
        'updated_at': '2025-01-01T10:00:00Z',
      };

      final c = Consultation.fromJson(json);
      expect(c.agreedFeeUah, 1000.0);
    });

    test('default status is pending', () {
      final c = Consultation.fromJson({'id': 'c5'});
      expect(c.status, 'pending');
    });

    test('fromJson handles empty document_ids list', () {
      final json = {
        'id': 'c6',
        'document_ids': [],
        'created_at': '2025-01-01T10:00:00Z',
        'updated_at': '2025-01-01T10:00:00Z',
      };

      final c = Consultation.fromJson(json);
      expect(c.documentIds, isEmpty);
    });

    test('fromJson handles null document_ids', () {
      final json = {
        'id': 'c7',
        'document_ids': null,
        'created_at': '2025-01-01T10:00:00Z',
        'updated_at': '2025-01-01T10:00:00Z',
      };

      final c = Consultation.fromJson(json);
      expect(c.documentIds, isEmpty);
    });
  });

  group('ConsultationPayment', () {
    test('fromJson parses all fields', () {
      final json = {
        'id': 'p1',
        'consultation_id': 'c1',
        'amount_uah': 500.0,
        'platform_fee_uah': 50.0,
        'attorney_payout_uah': 450.0,
        'status': 'completed',
        'payment_provider': 'monobank',
        'created_at': '2025-01-01T10:00:00Z',
      };

      final p = ConsultationPayment.fromJson(json);

      expect(p.id, 'p1');
      expect(p.consultationId, 'c1');
      expect(p.amountUah, 500.0);
      expect(p.platformFeeUah, 50.0);
      expect(p.attorneyPayoutUah, 450.0);
      expect(p.status, 'completed');
      expect(p.paymentProvider, 'monobank');
    });

    test('fromJson handles missing fields with defaults', () {
      final json = <String, dynamic>{};

      final p = ConsultationPayment.fromJson(json);

      expect(p.id, '');
      expect(p.consultationId, '');
      expect(p.amountUah, 0);
      expect(p.platformFeeUah, 0);
      expect(p.attorneyPayoutUah, 0);
      expect(p.status, 'pending');
      expect(p.paymentProvider, isNull);
    });

    test('fromJson parses numeric amounts from int', () {
      final json = {
        'id': 'p2',
        'consultation_id': 'c2',
        'amount_uah': 1000,
        'platform_fee_uah': 100,
        'attorney_payout_uah': 900,
        'status': 'pending',
        'created_at': '2025-01-01T10:00:00Z',
      };

      final p = ConsultationPayment.fromJson(json);
      expect(p.amountUah, 1000.0);
      expect(p.platformFeeUah, 100.0);
      expect(p.attorneyPayoutUah, 900.0);
    });

    test('fromJson handles null payment_provider', () {
      final json = {
        'id': 'p3',
        'consultation_id': 'c3',
        'created_at': '2025-01-01T10:00:00Z',
      };

      final p = ConsultationPayment.fromJson(json);
      expect(p.paymentProvider, isNull);
    });
  });

  group('AttorneyPayout', () {
    test('fromJson parses all fields', () {
      final json = {
        'id': 'ap1',
        'attorney_user_id': 'u1',
        'consultation_payment_id': 'p1',
        'amount_uah': 450.0,
        'status': 'paid',
        'created_at': '2025-01-01T10:00:00Z',
        'consultation_id': 'c1',
        'request_title': 'Земельна справа',
      };

      final a = AttorneyPayout.fromJson(json);

      expect(a.id, 'ap1');
      expect(a.attorneyUserId, 'u1');
      expect(a.consultationPaymentId, 'p1');
      expect(a.amountUah, 450.0);
      expect(a.status, 'paid');
      expect(a.consultationId, 'c1');
      expect(a.requestTitle, 'Земельна справа');
    });

    test('fromJson handles missing fields with defaults', () {
      final json = <String, dynamic>{};

      final a = AttorneyPayout.fromJson(json);

      expect(a.id, '');
      expect(a.attorneyUserId, '');
      expect(a.consultationPaymentId, isNull);
      expect(a.amountUah, 0);
      expect(a.status, 'pending');
      expect(a.consultationId, isNull);
      expect(a.requestTitle, isNull);
    });

    test('fromJson parses amount from int', () {
      final json = {
        'id': 'ap2',
        'attorney_user_id': 'u2',
        'amount_uah': 300,
        'status': 'pending',
        'created_at': '2025-01-01T10:00:00Z',
      };

      final a = AttorneyPayout.fromJson(json);
      expect(a.amountUah, 300.0);
    });

    test('fromJson handles null optional fields', () {
      final json = {
        'id': 'ap3',
        'attorney_user_id': 'u3',
        'consultation_payment_id': null,
        'amount_uah': 200.0,
        'status': 'pending',
        'created_at': '2025-01-01T10:00:00Z',
        'consultation_id': null,
        'request_title': null,
      };

      final a = AttorneyPayout.fromJson(json);
      expect(a.consultationPaymentId, isNull);
      expect(a.consultationId, isNull);
      expect(a.requestTitle, isNull);
    });

    test('various statuses are preserved', () {
      for (final status in ['pending', 'paid', 'failed', 'processing']) {
        final json = {
          'id': 'ap',
          'attorney_user_id': 'u',
          'amount_uah': 100,
          'status': status,
          'created_at': '2025-01-01T10:00:00Z',
        };
        final a = AttorneyPayout.fromJson(json);
        expect(a.status, status);
      }
    });
  });
}
