import { v4 as uuidv4 } from 'uuid';
import fsPromises from 'fs/promises';
import { logger } from '../utils/logger.js';
import { UploadService, UploadSession } from './upload-service.js';
import { MinioService } from './minio-service.js';
import { DocumentService } from './document-service.js';
import { VaultTools } from '../api/vault-tools.js';
import { ArchiveExtractorService } from './archive-extractor.js';
import type { IDatabase } from '../domain/ports/index.js';

export interface ProcessorDeps {
  uploadService: UploadService;
  minioService: MinioService;
  vaultTools: VaultTools;
  db: IDatabase;
  documentService?: DocumentService;
}

/**
 * Process an assembled upload file — routes to VaultTools or MinIO.
 * Shared by the upload route handler and the recovery service.
 */
export async function processUploadFile(
  session: UploadSession,
  assembledPath: string,
  deps: ProcessorDeps,
  extraMetadata?: Record<string, any>
): Promise<string> {
  const { uploadService, minioService, vaultTools, db } = deps;

  let documentId: string;

  if (UploadService.isArchiveType(session.mimeType)) {
    // Route to archive extraction pipeline
    documentId = uuidv4();

    // Store original archive in MinIO (preserve original)
    const objectKey = MinioService.generateObjectKey(session.fileName);
    const minioResult = await minioService.uploadFile(
      session.userId,
      objectKey,
      assembledPath,
      session.mimeType
    );
    const storagePath = `${minioResult.bucket}/${minioResult.key}`;

    // Create parent archive document record
    await db.query(
      `INSERT INTO documents
        (id, zakononline_id, type, title, metadata, storage_type, storage_path, file_size, mime_type, user_id, matter_id)
       VALUES ($1, $2, $3, $4, $5, 'minio', $6, $7, $8, $9, $10)`,
      [
        documentId,
        documentId,
        session.docType || 'other',
        session.fileName.replace(/\.[^/.]+$/, ''),
        JSON.stringify({
          ...session.metadata,
          isArchive: true,
          originalFilename: session.fileName,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          folderPath: session.relativePath,
          uploadedAt: new Date().toISOString(),
          minioEtag: minioResult.etag,
          minioBucket: minioResult.bucket,
          minioKey: minioResult.key,
          uploadSessionId: session.id,
          ...extraMetadata,
        }),
        storagePath,
        session.fileSize,
        session.mimeType,
        session.userId,
        session.matterId || null,
      ]
    );

    // Extract archive contents and process each file
    const extractor = new ArchiveExtractorService(vaultTools, minioService, db);
    const extractionResult = await extractor.extractAndProcess({
      archivePath: assembledPath,
      mimeType: session.mimeType,
      parentDocumentId: documentId,
      archiveTitle: session.fileName,
      userId: session.userId,
      metadata: {
        ...session.metadata,
        folderPath: session.relativePath,
        uploadSessionId: session.id,
        ...extraMetadata,
      },
      matterId: session.matterId,
    });

    // Update parent document metadata with extraction results
    const childDocumentIds = extractionResult.children
      .filter(c => c.documentId)
      .map(c => c.documentId);

    await db.query(
      `UPDATE documents SET metadata = metadata || $2::jsonb WHERE id = $1`,
      [
        documentId,
        JSON.stringify({
          childDocumentIds,
          extractionStats: {
            totalFiles: extractionResult.totalFiles,
            processedFiles: extractionResult.processedFiles,
            failedFiles: extractionResult.failedFiles,
          },
        }),
      ]
    );

    logger.info('[Upload] Archive processed', {
      sessionId: session.id,
      documentId,
      totalFiles: extractionResult.totalFiles,
      processedFiles: extractionResult.processedFiles,
      failedFiles: extractionResult.failedFiles,
    });
  } else if (UploadService.isDocumentType(session.mimeType)) {
    // Route to VaultTools for parsing, embedding, etc.
    const result = await vaultTools.storeDocumentFromPath({
      filePath: assembledPath,
      mimeType: session.mimeType,
      title: session.fileName.replace(/\.[^/.]+$/, ''),
      type: (session.docType || 'other') as any,
      userId: session.userId,
      metadata: {
        ...session.metadata,
        originalFilename: session.fileName,
        fileSize: session.fileSize,
        mimeType: session.mimeType,
        folderPath: session.relativePath,
        uploadSessionId: session.id,
        ...extraMetadata,
      },
    });

    documentId = result.id;

    logger.info('[Upload] Document processed via VaultTools', {
      sessionId: session.id,
      documentId,
    });
  } else {
    // Route to MinIO for binary storage
    const objectKey = MinioService.generateObjectKey(session.fileName);

    const minioResult = await minioService.uploadFile(
      session.userId,
      objectKey,
      assembledPath,
      session.mimeType
    );

    const storagePath = `${minioResult.bucket}/${minioResult.key}`;
    documentId = uuidv4();

    // Best-effort text extraction for MinIO-routed files
    let fullText: string | null = null;
    let extractedSections: import('../types/index.js').DocumentSection[] = [];
    let extractionMeta: Record<string, any> = {};

    try {
      const fileBuffer = await fsPromises.readFile(assembledPath);
      const extraction = await vaultTools.extractTextFromFile({
        fileBuffer,
        mimeType: session.mimeType,
        documentId,
        title: session.fileName.replace(/\.[^/.]+$/, ''),
        type: session.docType || 'other',
        metadata: { ...session.metadata, ...extraMetadata },
        userId: session.userId,
      });

      fullText = extraction.fullText;
      extractedSections = extraction.sections;
      extractionMeta = {
        textExtracted: !!fullText,
        extractionSource: fullText ? 'auto' : null,
        sectionCount: extraction.sections.length,
        embeddingCount: extraction.embeddingCount,
      };

      if (fullText) {
        logger.info('[Upload] Text extracted from MinIO file', {
          sessionId: session.id,
          documentId,
          textLength: fullText.length,
          sections: extraction.sections.length,
          embeddings: extraction.embeddingCount,
        });
      }
    } catch (err: any) {
      logger.warn('[Upload] Text extraction failed (non-blocking)', {
        sessionId: session.id,
        mimeType: session.mimeType,
        error: err.message,
      });
    }

    // Save metadata record in documents table (now includes full_text)
    await db.query(
      `INSERT INTO documents
        (id, zakononline_id, type, title, full_text, metadata, storage_type, storage_path, file_size, mime_type, user_id, matter_id)
       VALUES ($1, $2, $3, $4, $5, $6, 'minio', $7, $8, $9, $10, $11)`,
      [
        documentId,
        documentId,
        session.docType || 'other',
        session.fileName.replace(/\.[^/.]+$/, ''),
        fullText,
        JSON.stringify({
          ...session.metadata,
          originalFilename: session.fileName,
          fileSize: session.fileSize,
          mimeType: session.mimeType,
          folderPath: session.relativePath,
          uploadedAt: new Date().toISOString(),
          minioEtag: minioResult.etag,
          minioBucket: minioResult.bucket,
          minioKey: minioResult.key,
          uploadSessionId: session.id,
          ...extractionMeta,
          ...extraMetadata,
        }),
        storagePath,
        session.fileSize,
        session.mimeType,
        session.userId,
        session.matterId || null,
      ]
    );

    // Save sections if text was extracted
    if (extractedSections.length > 0 && deps.documentService) {
      try {
        await deps.documentService.saveSections(documentId, extractedSections);
      } catch (err: any) {
        logger.warn('[Upload] Failed to save extracted sections', {
          documentId,
          error: err.message,
        });
      }
    }

    logger.info('[Upload] File stored in MinIO', {
      sessionId: session.id,
      documentId,
      bucket: minioResult.bucket,
      key: minioResult.key,
      textExtracted: !!fullText,
    });
  }

  return documentId;
}
