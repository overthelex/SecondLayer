import 'dart:io';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:path_provider/path_provider.dart';

/// Metadata for a cached document stored in Hive.
class CachedDocumentMeta {
  final String id;
  final String title;
  final String localPath;
  final DateTime cachedAt;
  final int sizeBytes;
  final String type; // 'pdf' | 'text'

  const CachedDocumentMeta({
    required this.id,
    required this.title,
    required this.localPath,
    required this.cachedAt,
    required this.sizeBytes,
    required this.type,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'title': title,
        'localPath': localPath,
        'cachedAt': cachedAt.toIso8601String(),
        'sizeBytes': sizeBytes,
        'type': type,
      };

  factory CachedDocumentMeta.fromJson(Map<dynamic, dynamic> json) =>
      CachedDocumentMeta(
        id: json['id'] as String,
        title: json['title'] as String,
        localPath: json['localPath'] as String,
        cachedAt: DateTime.parse(json['cachedAt'] as String),
        sizeBytes: json['sizeBytes'] as int,
        type: json['type'] as String,
      );
}

/// Persistent document cache using Hive for metadata and
/// the app documents directory for file storage.
class DocumentCacheService {
  static const _boxName = 'document_cache';
  late final Box _box;
  late final String _cacheDir;

  Future<void> init() async {
    _box = await Hive.openBox(_boxName);
    final appDir = await getApplicationDocumentsDirectory();
    _cacheDir = '${appDir.path}/cached_documents';
    await Directory(_cacheDir).create(recursive: true);
  }

  /// Returns the persistent file path for a given document.
  String _filePath(String documentId, String extension) =>
      '$_cacheDir/$documentId.$extension';

  /// Check whether a document is cached.
  bool isCached(String documentId) => _box.containsKey(documentId);

  /// Get cached metadata for a document.
  CachedDocumentMeta? getMeta(String documentId) {
    final raw = _box.get(documentId);
    if (raw == null) return null;
    return CachedDocumentMeta.fromJson(Map<dynamic, dynamic>.from(raw as Map));
  }

  /// Get all cached document IDs (for quick lookup in list views).
  Set<String> get cachedIds =>
      _box.keys.cast<String>().toSet();

  /// Cache a PDF file: copies from [sourcePath] to persistent storage.
  Future<CachedDocumentMeta> cachePdf({
    required String documentId,
    required String title,
    required String sourcePath,
  }) async {
    final destPath = _filePath(documentId, 'pdf');
    final sourceFile = File(sourcePath);
    await sourceFile.copy(destPath);
    final stat = await File(destPath).stat();

    final meta = CachedDocumentMeta(
      id: documentId,
      title: title,
      localPath: destPath,
      cachedAt: DateTime.now(),
      sizeBytes: stat.size,
      type: 'pdf',
    );
    await _box.put(documentId, meta.toJson());
    return meta;
  }

  /// Cache text content for a document.
  Future<CachedDocumentMeta> cacheText({
    required String documentId,
    required String title,
    required String content,
  }) async {
    final destPath = _filePath(documentId, 'txt');
    final file = File(destPath);
    await file.writeAsString(content);
    final stat = await file.stat();

    final meta = CachedDocumentMeta(
      id: documentId,
      title: title,
      localPath: destPath,
      cachedAt: DateTime.now(),
      sizeBytes: stat.size,
      type: 'text',
    );
    await _box.put(documentId, meta.toJson());
    return meta;
  }

  /// Read cached text content.
  Future<String?> readCachedText(String documentId) async {
    final meta = getMeta(documentId);
    if (meta == null || meta.type != 'text') return null;
    final file = File(meta.localPath);
    if (!file.existsSync()) {
      await _removeMeta(documentId);
      return null;
    }
    return file.readAsString();
  }

  /// Get the local path for a cached PDF.
  String? getCachedPdfPath(String documentId) {
    final meta = getMeta(documentId);
    if (meta == null || meta.type != 'pdf') return null;
    final file = File(meta.localPath);
    if (!file.existsSync()) {
      _removeMeta(documentId);
      return null;
    }
    return meta.localPath;
  }

  /// Remove a single cached document.
  Future<void> removeCached(String documentId) async {
    final meta = getMeta(documentId);
    if (meta != null) {
      final file = File(meta.localPath);
      if (file.existsSync()) await file.delete();
    }
    await _removeMeta(documentId);
  }

  /// Clear entire document cache — files and metadata.
  Future<void> clearAll() async {
    // Delete all cached files
    final dir = Directory(_cacheDir);
    if (dir.existsSync()) {
      await for (final entity in dir.list()) {
        if (entity is File) await entity.delete();
      }
    }
    await _box.clear();
  }

  /// Total size of cached documents in bytes.
  int get totalCacheSize {
    int total = 0;
    for (final key in _box.keys) {
      final meta = getMeta(key as String);
      if (meta != null) total += meta.sizeBytes;
    }
    return total;
  }

  /// Human-readable cache size.
  String get totalCacheSizeFormatted {
    final bytes = totalCacheSize;
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
  }

  Future<void> _removeMeta(String documentId) async {
    await _box.delete(documentId);
  }
}
