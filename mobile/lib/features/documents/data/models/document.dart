class VaultDocument {
  final String id;
  final String title;
  final String type;
  final String? folderId;
  final String? folderPath;
  final int? sizeBytes;
  final DateTime? uploadedAt;

  const VaultDocument({
    required this.id,
    required this.title,
    required this.type,
    this.folderId,
    this.folderPath,
    this.sizeBytes,
    this.uploadedAt,
  });

  String get sizeFormatted {
    if (sizeBytes == null) return '';
    if (sizeBytes! < 1024) return '$sizeBytes B';
    if (sizeBytes! < 1024 * 1024) return '${(sizeBytes! / 1024).toStringAsFixed(1)} KB';
    return '${(sizeBytes! / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  factory VaultDocument.fromJson(Map<String, dynamic> json) => VaultDocument(
        id: json['id']?.toString() ?? '',
        title: json['title'] as String? ?? json['name'] as String? ?? '',
        type: json['type'] as String? ??
            json['mime_type'] as String? ??
            'unknown',
        folderId: json['folder_id']?.toString(),
        folderPath: json['folder_path'] as String?,
        sizeBytes: json['size_bytes'] as int? ?? json['size'] as int?,
        uploadedAt: json['uploaded_at'] != null || json['created_at'] != null
            ? DateTime.tryParse(
                (json['uploaded_at'] ?? json['created_at']) as String)
            : null,
      );
}

class DocumentFolder {
  final String id;
  final String name;
  final String? parentId;

  const DocumentFolder({
    required this.id,
    required this.name,
    this.parentId,
  });

  factory DocumentFolder.fromJson(Map<String, dynamic> json) => DocumentFolder(
        id: json['id']?.toString() ?? '',
        name: json['name'] as String? ?? '',
        parentId: json['parent_id']?.toString(),
      );
}

class UploadProgress {
  final String fileName;
  final int totalChunks;
  final int uploadedChunks;
  final String status; // 'pending' | 'uploading' | 'completed' | 'error'
  final String? error;
  final String? sessionId;

  const UploadProgress({
    required this.fileName,
    required this.totalChunks,
    this.uploadedChunks = 0,
    this.status = 'pending',
    this.error,
    this.sessionId,
  });

  double get progress =>
      totalChunks > 0 ? uploadedChunks / totalChunks : 0;

  UploadProgress copyWith({
    int? uploadedChunks,
    String? status,
    String? error,
    String? sessionId,
  }) =>
      UploadProgress(
        fileName: fileName,
        totalChunks: totalChunks,
        uploadedChunks: uploadedChunks ?? this.uploadedChunks,
        status: status ?? this.status,
        error: error ?? this.error,
        sessionId: sessionId ?? this.sessionId,
      );
}
