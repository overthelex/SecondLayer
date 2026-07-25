import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import '../../../core/network/api_client.dart';
import 'models/document.dart';

class UploadService {
  final ApiClient _api;
  static const _chunkSize = 5 * 1024 * 1024; // 5MB

  UploadService({required ApiClient api}) : _api = api;

  /// Upload a file in chunks. Calls onProgress for each chunk uploaded.
  Future<void> uploadFile({
    required File file,
    required String fileName,
    String? folderId,
    required void Function(UploadProgress progress) onProgress,
  }) async {
    final fileSize = await file.length();
    final totalChunks = (fileSize / _chunkSize).ceil();

    onProgress(UploadProgress(
      fileName: fileName,
      totalChunks: totalChunks,
      status: 'uploading',
    ));

    // Init upload session
    final initResponse = await _api.post('/api/upload/init', data: {
      'fileName': fileName,
      'fileSize': fileSize,
      'totalChunks': totalChunks,
      'mimeType': _guessMimeType(fileName),
      if (folderId != null) 'folderId': folderId,
    });

    final sessionId = initResponse.data['sessionId'] as String;

    // Upload chunks
    final raf = await file.open();
    int uploadedChunks = 0;

    try {
      for (int i = 0; i < totalChunks; i++) {
        final start = i * _chunkSize;
        final end = start + _chunkSize > fileSize ? fileSize : start + _chunkSize;
        final chunkLength = end - start;

        await raf.setPosition(start);
        final chunkData = await raf.read(chunkLength);

        await _uploadChunk(sessionId, i, chunkData);
        uploadedChunks++;

        onProgress(UploadProgress(
          fileName: fileName,
          totalChunks: totalChunks,
          uploadedChunks: uploadedChunks,
          status: 'uploading',
          sessionId: sessionId,
        ));
      }
    } finally {
      await raf.close();
    }

    // Complete upload
    await _api.post('/api/upload/$sessionId/complete');

    onProgress(UploadProgress(
      fileName: fileName,
      totalChunks: totalChunks,
      uploadedChunks: totalChunks,
      status: 'completed',
      sessionId: sessionId,
    ));
  }

  Future<void> _uploadChunk(
      String sessionId, int chunkIndex, Uint8List data) async {
    final formData = FormData.fromMap({
      'chunkIndex': chunkIndex,
      'chunk': MultipartFile.fromBytes(data, filename: 'chunk_$chunkIndex'),
    });

    await _api.dio.post(
      '/api/upload/$sessionId/chunk',
      data: formData,
      options: Options(contentType: 'multipart/form-data'),
    );
  }

  String _guessMimeType(String fileName) {
    final ext = fileName.split('.').last.toLowerCase();
    return switch (ext) {
      'pdf' => 'application/pdf',
      'docx' =>
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'doc' => 'application/msword',
      'txt' => 'text/plain',
      'html' || 'htm' => 'text/html',
      'rtf' => 'application/rtf',
      _ => 'application/octet-stream',
    };
  }
}
