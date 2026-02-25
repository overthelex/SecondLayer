import { v4 as uuidv4 } from 'uuid';
import fsPromises from 'fs/promises';
import { logger } from '../utils/logger.js';
import { UploadService, UploadSession } from './upload-service.js';
import { MinioService } from './minio-service.js';
import { DocumentService } from './document-service.js';
import { VaultTools } from '../api/vault-tools.js';
import { Pool } from 'pg';

export interface ProcessorDeps {
  uploadService: UploadService;
  minioService: MinioService;
  vaultTools: VaultTools;
  pool: Pool;
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
  const { uploadService, minioService, vaultTools, pool } = deps;

  let documentId: string;

  if (UploadService.isDocumentType(session.mimeType)) {
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
    await pool.query(
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
