import 'dart:io';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../../core/di/service_locator.dart';
import '../data/document_repository.dart';
import '../data/upload_service.dart';
import '../data/models/document.dart';

final documentRepositoryProvider = Provider<DocumentRepository>((ref) {
  return DocumentRepository(api: sl.apiClient);
});

final uploadServiceProvider = Provider<UploadService>((ref) {
  return UploadService(api: sl.apiClient);
});

final documentNotifierProvider =
    NotifierProvider<DocumentNotifier, DocumentState>(DocumentNotifier.new);

class DocumentState {
  final List<VaultDocument> documents;
  final List<DocumentFolder> folders;
  final bool isLoading;
  final String? error;
  final String? currentFolderId;
  final List<String> breadcrumb; // folder names
  final Map<String, UploadProgress> uploads; // fileName -> progress

  const DocumentState({
    this.documents = const [],
    this.folders = const [],
    this.isLoading = false,
    this.error,
    this.currentFolderId,
    this.breadcrumb = const [],
    this.uploads = const {},
  });

  DocumentState copyWith({
    List<VaultDocument>? documents,
    List<DocumentFolder>? folders,
    bool? isLoading,
    String? error,
    String? currentFolderId,
    List<String>? breadcrumb,
    Map<String, UploadProgress>? uploads,
    bool clearError = false,
    bool clearFolder = false,
  }) =>
      DocumentState(
        documents: documents ?? this.documents,
        folders: folders ?? this.folders,
        isLoading: isLoading ?? this.isLoading,
        error: clearError ? null : (error ?? this.error),
        currentFolderId:
            clearFolder ? null : (currentFolderId ?? this.currentFolderId),
        breadcrumb: breadcrumb ?? this.breadcrumb,
        uploads: uploads ?? this.uploads,
      );
}

class DocumentNotifier extends Notifier<DocumentState> {
  late final DocumentRepository _repo;
  late final UploadService _uploadService;

  @override
  DocumentState build() {
    _repo = ref.read(documentRepositoryProvider);
    _uploadService = ref.read(uploadServiceProvider);
    Future.microtask(() => loadDocuments());
    return const DocumentState(isLoading: true);
  }

  Future<void> loadDocuments() async {
    state = state.copyWith(isLoading: true, clearError: true);
    try {
      final docs =
          await _repo.getDocuments(folderId: state.currentFolderId);
      final folders =
          await _repo.getFolders(parentId: state.currentFolderId);
      state = state.copyWith(
        documents: docs,
        folders: folders,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(isLoading: false, error: e.toString());
    }
  }

  void navigateToFolder(DocumentFolder folder) {
    state = state.copyWith(
      currentFolderId: folder.id,
      breadcrumb: [...state.breadcrumb, folder.name],
    );
    loadDocuments();
  }

  void navigateUp() {
    if (state.breadcrumb.isEmpty) return;
    final newBreadcrumb = List<String>.from(state.breadcrumb)..removeLast();
    state = state.copyWith(
      breadcrumb: newBreadcrumb,
      clearFolder: newBreadcrumb.isEmpty,
      currentFolderId: null, // simplified — full impl needs parent IDs
    );
    loadDocuments();
  }

  Future<void> uploadFile(File file, String fileName) async {
    await _uploadService.uploadFile(
      file: file,
      fileName: fileName,
      folderId: state.currentFolderId,
      onProgress: (progress) {
        final uploads = Map<String, UploadProgress>.from(state.uploads);
        uploads[fileName] = progress;
        state = state.copyWith(uploads: uploads);
      },
    );

    // Remove from uploads map after completion
    final uploads = Map<String, UploadProgress>.from(state.uploads);
    uploads.remove(fileName);
    state = state.copyWith(uploads: uploads);

    // Reload documents
    loadDocuments();
  }

  Future<void> deleteDocument(String id) async {
    await _repo.deleteDocument(id);
    state = state.copyWith(
      documents: state.documents.where((d) => d.id != id).toList(),
    );
  }
}
