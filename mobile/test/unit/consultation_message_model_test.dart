import 'package:flutter_test/flutter_test.dart';
import 'package:secondlayer_mobile/features/consultation/data/models/consultation_message.dart';

void main() {
  group('ConsultationMessage', () {
    test('fromJson parses all fields', () {
      final json = {
        'id': 'm1',
        'consultation_id': 'c1',
        'sender_id': 's1',
        'sender_name': 'Іван',
        'content': 'Привіт',
        'status': 'delivered',
        'created_at': '2025-01-01T10:00:00Z',
        'attachments': [],
      };

      final m = ConsultationMessage.fromJson(json);

      expect(m.id, 'm1');
      expect(m.consultationId, 'c1');
      expect(m.senderId, 's1');
      expect(m.senderName, 'Іван');
      expect(m.content, 'Привіт');
      expect(m.status, 'delivered');
      expect(m.attachments, isEmpty);
    });

    test('fromJson handles missing fields', () {
      final json = <String, dynamic>{};

      final m = ConsultationMessage.fromJson(json);

      expect(m.id, '');
      expect(m.consultationId, '');
      expect(m.senderId, '');
      expect(m.senderName, '');
      expect(m.content, '');
      expect(m.status, 'sent');
      expect(m.attachments, isEmpty);
    });

    test('fromJson parses attachments', () {
      final json = {
        'id': 'm2',
        'consultation_id': 'c1',
        'sender_id': 's1',
        'sender_name': 'Олена',
        'content': '',
        'created_at': '2025-01-01T10:00:00Z',
        'attachments': [
          {
            'id': 'a1',
            'name': 'document.pdf',
            'type': 'file',
            'url': 'https://example.com/doc.pdf',
            'size': 1024,
          },
        ],
      };

      final m = ConsultationMessage.fromJson(json);

      expect(m.attachments.length, 1);
      expect(m.attachments[0].id, 'a1');
      expect(m.attachments[0].name, 'document.pdf');
      expect(m.attachments[0].type, 'file');
      expect(m.attachments[0].url, 'https://example.com/doc.pdf');
      expect(m.attachments[0].size, 1024);
    });

    test('copyWith changes status only', () {
      final original = ConsultationMessage(
        id: 'm1',
        consultationId: 'c1',
        senderId: 's1',
        senderName: 'Test',
        content: 'Hello',
        status: 'sending',
        createdAt: DateTime(2025, 1, 1),
      );

      final updated = original.copyWith(status: 'sent');

      expect(updated.id, 'm1');
      expect(updated.content, 'Hello');
      expect(updated.status, 'sent');
      expect(updated.senderName, 'Test');
    });

    test('copyWith preserves status when not provided', () {
      final original = ConsultationMessage(
        id: 'm1',
        consultationId: 'c1',
        senderId: 's1',
        senderName: 'Test',
        content: 'Hello',
        status: 'delivered',
        createdAt: DateTime(2025, 1, 1),
      );

      final updated = original.copyWith();

      expect(updated.status, 'delivered');
    });

    test('default status is sent', () {
      final m = ConsultationMessage(
        id: 'm1',
        consultationId: 'c1',
        senderId: 's1',
        senderName: 'Test',
        content: 'Hello',
        createdAt: DateTime(2025, 1, 1),
      );

      expect(m.status, 'sent');
    });

    test('fromJson handles null attachments', () {
      final json = {
        'id': 'm3',
        'consultation_id': 'c1',
        'sender_id': 's1',
        'sender_name': 'Test',
        'content': 'Hi',
        'created_at': '2025-01-01T10:00:00Z',
        'attachments': null,
      };

      final m = ConsultationMessage.fromJson(json);
      expect(m.attachments, isEmpty);
    });

    test('fromJson handles multiple attachments', () {
      final json = {
        'id': 'm4',
        'consultation_id': 'c1',
        'sender_id': 's1',
        'sender_name': 'Test',
        'content': '',
        'created_at': '2025-01-01T10:00:00Z',
        'attachments': [
          {'id': 'a1', 'name': 'file1.pdf', 'type': 'file', 'url': 'http://a'},
          {'id': 'a2', 'name': 'image.jpg', 'type': 'image', 'url': 'http://b'},
        ],
      };

      final m = ConsultationMessage.fromJson(json);
      expect(m.attachments.length, 2);
      expect(m.attachments[0].type, 'file');
      expect(m.attachments[1].type, 'image');
    });
  });

  group('ConsultationAttachment', () {
    test('fromJson parses all fields', () {
      final json = {
        'id': 'a1',
        'name': 'test.pdf',
        'type': 'file',
        'url': 'https://example.com/test.pdf',
        'size': 2048,
      };

      final a = ConsultationAttachment.fromJson(json);

      expect(a.id, 'a1');
      expect(a.name, 'test.pdf');
      expect(a.type, 'file');
      expect(a.url, 'https://example.com/test.pdf');
      expect(a.size, 2048);
    });

    test('fromJson handles missing fields', () {
      final json = <String, dynamic>{};

      final a = ConsultationAttachment.fromJson(json);

      expect(a.id, '');
      expect(a.name, '');
      expect(a.type, 'file');
      expect(a.url, '');
      expect(a.size, isNull);
    });

    test('fromJson handles null size', () {
      final json = {
        'id': 'a2',
        'name': 'photo.jpg',
        'type': 'image',
        'url': 'https://example.com/photo.jpg',
        'size': null,
      };

      final a = ConsultationAttachment.fromJson(json);
      expect(a.size, isNull);
    });

    test('default type is file', () {
      final json = {
        'id': 'a3',
        'name': 'unknown',
        'url': 'https://example.com/file',
      };

      final a = ConsultationAttachment.fromJson(json);
      expect(a.type, 'file');
    });
  });
}
