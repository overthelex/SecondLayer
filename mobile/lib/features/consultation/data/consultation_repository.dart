import 'dart:async';
import 'dart:io';
import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import '../../../core/network/sse_client.dart';
import 'models/consultation.dart';
import 'models/consultation_message.dart';

class ConsultationRepository {
  final ApiClient _api;
  final SSEClient _sse;

  ConsultationRepository({required ApiClient api, required SSEClient sse})
      : _api = api,
        _sse = sse;

  Future<List<Consultation>> getConsultations() async {
    final response = await _api.get('/api/consultations');
    final list = response.data as List? ?? [];
    return list
        .map((e) => Consultation.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<Consultation> getConsultation(String consultationId) async {
    final response = await _api.get('/api/consultations/$consultationId');
    return Consultation.fromJson(response.data as Map<String, dynamic>);
  }

  Future<List<ConsultationMessage>> getMessages(String consultationId) async {
    final response =
        await _api.get('/api/consultations/$consultationId/messages');
    final list = response.data as List? ?? [];
    return list
        .map((e) => ConsultationMessage.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<ConsultationMessage> sendMessage(
      String consultationId, String content) async {
    final response = await _api.post(
      '/api/consultations/$consultationId/messages',
      data: {'content': content},
    );
    return ConsultationMessage.fromJson(
        response.data as Map<String, dynamic>);
  }

  Future<ConsultationMessage> sendFileMessage(
    String consultationId,
    File file, {
    void Function(int, int)? onProgress,
  }) async {
    final formData = FormData.fromMap({
      'file': await MultipartFile.fromFile(file.path,
          filename: file.path.split('/').last),
    });

    final response = await _api.dio.post(
      '/api/consultations/$consultationId/messages/file',
      data: formData,
      onSendProgress: onProgress,
    );
    return ConsultationMessage.fromJson(
        response.data as Map<String, dynamic>);
  }

  Future<void> markAsRead(String consultationId) async {
    await _api.put('/api/consultations/$consultationId/read');
  }

  Future<void> sendTyping(String consultationId) async {
    await _api.post('/api/consultations/$consultationId/typing');
  }

  Future<Map<String, dynamic>> saveAttachmentToVault({
    required String consultationId,
    required String messageId,
    required String attachmentId,
  }) async {
    final response = await _api.post(
      '/api/consultations/$consultationId/messages/$messageId/attachments/$attachmentId/vault',
    );
    return response.data as Map<String, dynamic>;
  }

  Future<ConsultationPayment?> getPaymentStatus(
      String consultationId) async {
    try {
      final response =
          await _api.get('/api/consultations/$consultationId/payment');
      return ConsultationPayment.fromJson(
          response.data as Map<String, dynamic>);
    } catch (_) {
      return null;
    }
  }

  Future<List<AttorneyPayout>> getMyPayouts() async {
    final response = await _api.get('/api/consultations/payouts/me');
    final list = response.data as List? ?? [];
    return list
        .map((e) => AttorneyPayout.fromJson(e as Map<String, dynamic>))
        .toList();
  }

  Future<StreamSubscription?> streamMessages({
    required String consultationId,
    required void Function(SSEEvent event) onEvent,
    required void Function() onDone,
    required void Function(dynamic error) onError,
  }) {
    return _sse.streamGet(
      path: '/api/consultations/$consultationId/messages/stream',
      onEvent: onEvent,
      onDone: onDone,
      onError: onError,
    );
  }
}
