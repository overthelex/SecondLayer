import AdmZip from 'adm-zip';
import tar from 'tar';
import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { VaultTools } from '../api/vault-tools.js';
import { MinioService } from './minio-service.js';
import { UploadService } from './upload-service.js';
import type { IDatabase } from '../domain/ports/index.js';

// Security limits
const MAX_FILES = 200;
const MAX_TOTAL_SIZE = 500 * 1024 * 1024; // 500MB
const MAX_SINGLE_FILE_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_COMPRESSION_RATIO = 100;
const MAX_NESTING_DEPTH = 2;

export interface ArchiveExtractionResult {
  parentDocumentId: string;
  totalFiles: number;
  processedFiles: number;
  failedFiles: number;
  children: {
    filename: string;
    documentId?: string;
    status: 'success' | 'failed' | 'skipped';
    error?: string;
    route: 'vault' | 'minio' | 'archive';
  }[];
}

interface ArchiveEntry {
  filename: string;
  data: Buffer;
  size: number;
}

export class ArchiveExtractorService {
  constructor(
    private vaultTools: VaultTools,
    private minioService: MinioService,
    private db: IDatabase,
  ) {}

  /**
   * Check if a MIME type represents an archive
   */
  static isArchiveType(mimeType: string): boolean {
    return UploadService.isArchiveType(mimeType);
  }

  /**
   * Extract archive and process each file through the appropriate pipeline.
   * Mirrors the EML attachment extraction pattern in vault-tools.ts.
   */
  async extractAndProcess(args: {
    archivePath: string;
    mimeType: string;
    parentDocumentId: string;
    archiveTitle: string;
    userId: string;
    metadata?: Record<string, any>;
    matterId?: string;
    depth?: number;
  }): Promise<ArchiveExtractionResult> {
    const depth = args.depth || 0;
    const result: ArchiveExtractionResult = {
      parentDocumentId: args.parentDocumentId,
      totalFiles: 0,
      processedFiles: 0,
      failedFiles: 0,
      children: [],
    };

    // Check nesting depth
    if (depth >= MAX_NESTING_DEPTH) {
      logger.warn('[Archive] Max nesting depth reached, skipping extraction', {
        parentDocumentId: args.parentDocumentId,
        depth,
      });
      return result;
    }

    const tempDir = path.join('/tmp/archive-extraction', uuidv4());
    await fs.mkdir(tempDir, { recursive: true });

    try {
      // Zip bomb check: compare archive size vs decompressed size
      const archiveStat = await fs.stat(args.archivePath);
      const archiveSize = archiveStat.size;

      // Extract entries based on type
      const entries = await this.extractEntries(
        args.archivePath,
        args.mimeType,
        tempDir,
        archiveSize,
      );

      result.totalFiles = entries.length;

      // Compute folder path for children
      const baseName = args.archiveTitle.replace(/\.(zip|tar|tar\.gz|tgz|gz)$/i, '');
      const parentFolder = args.metadata?.folderPath || '';
      const childFolder = parentFolder
        ? `${parentFolder.replace(/\/$/, '')}/${baseName}/`
        : `${baseName}/`;

      // Process each entry
      for (const entry of entries) {
        const childResult = await this.processEntry(entry, {
          parentDocumentId: args.parentDocumentId,
          archiveTitle: args.archiveTitle,
          userId: args.userId,
          metadata: args.metadata,
          matterId: args.matterId,
          folderPath: childFolder,
          tempDir,
          depth,
        });
        result.children.push(childResult);

        if (childResult.status === 'success') {
          result.processedFiles++;
        } else if (childResult.status === 'failed') {
          result.failedFiles++;
        }
      }

      logger.info('[Archive] Extraction complete', {
        parentDocumentId: args.parentDocumentId,
        total: result.totalFiles,
        processed: result.processedFiles,
        failed: result.failedFiles,
      });

      return result;
    } finally {
      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  /**
   * Extract entries from archive, enforcing security limits
   */
  private async extractEntries(
    archivePath: string,
    mimeType: string,
    tempDir: string,
    archiveSize: number,
  ): Promise<ArchiveEntry[]> {
    if (this.isZipType(mimeType)) {
      return this.extractZipEntries(archivePath, archiveSize);
    } else if (this.isTarType(mimeType)) {
      return this.extractTarEntries(archivePath, tempDir, archiveSize);
    }
    throw new Error(`Unsupported archive type: ${mimeType}`);
  }

  private isZipType(mimeType: string): boolean {
    return mimeType === 'application/zip' || mimeType === 'application/x-zip-compressed';
  }

  private isTarType(mimeType: string): boolean {
    return [
      'application/x-tar',
      'application/gzip',
      'application/x-gzip',
      'application/x-tgz',
      'application/x-compressed-tar',
    ].includes(mimeType);
  }

  /**
   * Extract ZIP entries using adm-zip
   */
  private extractZipEntries(archivePath: string, archiveSize: number): ArchiveEntry[] {
    const zip = new AdmZip(archivePath);
    const zipEntries = zip.getEntries();

    const entries: ArchiveEntry[] = [];
    let totalSize = 0;
    let fileCount = 0;

    for (const entry of zipEntries) {
      // Skip directories
      if (entry.isDirectory) continue;

      // Security: path traversal prevention
      const normalized = path.normalize(entry.entryName);
      if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
        logger.warn('[Archive] Skipping entry with suspicious path', {
          entryName: entry.entryName,
        });
        continue;
      }

      // Skip __MACOSX and hidden files
      if (entry.entryName.startsWith('__MACOSX/') || entry.entryName.includes('/.__')) {
        continue;
      }

      fileCount++;
      if (fileCount > MAX_FILES) {
        throw new Error(`Archive contains more than ${MAX_FILES} files — possible zip bomb`);
      }

      const size = entry.header.size; // decompressed size
      if (size > MAX_SINGLE_FILE_SIZE) {
        logger.warn('[Archive] Skipping oversized entry', {
          entryName: entry.entryName,
          size,
          limit: MAX_SINGLE_FILE_SIZE,
        });
        continue;
      }

      totalSize += size;
      if (totalSize > MAX_TOTAL_SIZE) {
        throw new Error(
          `Archive decompressed size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB — possible zip bomb`,
        );
      }

      // Compression ratio check
      const compressedSize = entry.header.compressedSize;
      if (compressedSize > 0 && size / compressedSize > MAX_COMPRESSION_RATIO) {
        throw new Error(
          `Entry "${entry.entryName}" has compression ratio ${(size / compressedSize).toFixed(0)}:1 — possible zip bomb`,
        );
      }

      const data = entry.getData();
      const filename = path.basename(entry.entryName);

      entries.push({
        filename,
        data,
        size: data.length,
      });
    }

    // Overall compression ratio check
    if (archiveSize > 0 && totalSize / archiveSize > MAX_COMPRESSION_RATIO) {
      throw new Error(
        `Overall compression ratio ${(totalSize / archiveSize).toFixed(0)}:1 exceeds limit — possible zip bomb`,
      );
    }

    return entries;
  }

  /**
   * Extract TAR/TAR.GZ entries
   */
  private async extractTarEntries(
    archivePath: string,
    tempDir: string,
    archiveSize: number,
  ): Promise<ArchiveEntry[]> {
    const entries: ArchiveEntry[] = [];
    let totalSize = 0;
    let fileCount = 0;

    // Extract to temp directory
    await tar.extract({
      file: archivePath,
      cwd: tempDir,
      filter: (entryPath, entry) => {
        // Security: path traversal prevention
        const normalized = path.normalize(entryPath);
        if (normalized.startsWith('..') || path.isAbsolute(normalized)) {
          logger.warn('[Archive] Skipping tar entry with suspicious path', { entryPath });
          return false;
        }

        // Skip symlinks (ReadEntry has type property)
        const entryType = 'type' in entry ? (entry as any).type : undefined;
        if (entryType === 'SymbolicLink' || entryType === 'Link') {
          logger.warn('[Archive] Skipping symlink in tar', { entryPath });
          return false;
        }

        // Skip directories
        if (entryType === 'Directory') return true; // allow dirs for structure

        fileCount++;
        if (fileCount > MAX_FILES) {
          throw new Error(`Archive contains more than ${MAX_FILES} files — possible tar bomb`);
        }

        const size = entry.size || 0;
        if (size > MAX_SINGLE_FILE_SIZE) {
          logger.warn('[Archive] Skipping oversized tar entry', {
            entryPath,
            size,
            limit: MAX_SINGLE_FILE_SIZE,
          });
          return false;
        }

        totalSize += size;
        if (totalSize > MAX_TOTAL_SIZE) {
          throw new Error(
            `Archive decompressed size exceeds ${MAX_TOTAL_SIZE / (1024 * 1024)}MB — possible tar bomb`,
          );
        }

        return true;
      },
    });

    // Compression ratio check (only meaningful for .tar.gz / .tgz)
    if (archiveSize > 0 && totalSize / archiveSize > MAX_COMPRESSION_RATIO) {
      throw new Error(
        `Overall compression ratio ${(totalSize / archiveSize).toFixed(0)}:1 exceeds limit — possible tar bomb`,
      );
    }

    // Collect extracted files from temp directory
    const collectedFiles = await this.collectFiles(tempDir);

    for (const filePath of collectedFiles) {
      const filename = path.basename(filePath);
      const data = await fs.readFile(filePath);

      entries.push({
        filename,
        data,
        size: data.length,
      });
    }

    return entries;
  }

  /**
   * Recursively collect all files in a directory
   */
  private async collectFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const dirEntries = await fs.readdir(dir, { withFileTypes: true });

    for (const dirEntry of dirEntries) {
      const fullPath = path.join(dir, dirEntry.name);
      if (dirEntry.isDirectory()) {
        const nested = await this.collectFiles(fullPath);
        files.push(...nested);
      } else if (dirEntry.isFile()) {
        // Skip symlinks (extra safety)
        const stat = await fs.lstat(fullPath);
        if (!stat.isSymbolicLink()) {
          files.push(fullPath);
        }
      }
    }

    return files;
  }

  /**
   * Process a single extracted entry — route to VaultTools, MinIO, or nested archive extraction
   */
  private async processEntry(
    entry: ArchiveEntry,
    ctx: {
      parentDocumentId: string;
      archiveTitle: string;
      userId: string;
      metadata?: Record<string, any>;
      matterId?: string;
      folderPath: string;
      tempDir: string;
      depth: number;
    },
  ): Promise<ArchiveExtractionResult['children'][number]> {
    const tempPath = path.join(ctx.tempDir, `${uuidv4()}-${entry.filename}`);

    try {
      await fs.writeFile(tempPath, entry.data);

      // Guess MIME type from extension
      const mimeType = this.guessMimeType(entry.filename);

      // Check if it's a nested archive
      if (UploadService.isArchiveType(mimeType) && ctx.depth < MAX_NESTING_DEPTH - 1) {
        const nestedResult = await this.extractAndProcess({
          archivePath: tempPath,
          mimeType,
          parentDocumentId: ctx.parentDocumentId,
          archiveTitle: entry.filename,
          userId: ctx.userId,
          metadata: { ...ctx.metadata, folderPath: ctx.folderPath },
          matterId: ctx.matterId,
          depth: ctx.depth + 1,
        });

        return {
          filename: entry.filename,
          status: 'success',
          route: 'archive',
        };
      }

      const isDocumentType = UploadService.isDocumentType(mimeType);
      const isImageType = /^image\/(jpeg|png|tiff|webp|bmp)$/.test(mimeType);

      if (isDocumentType || isImageType) {
        // Route through vault pipeline (same as EML attachment pattern)
        try {
          const result = await this.vaultTools.storeDocumentFromPath({
            filePath: tempPath,
            mimeType,
            title: entry.filename.replace(/\.[^/.]+$/, ''),
            type: 'other',
            metadata: {
              ...ctx.metadata,
              folderPath: ctx.folderPath,
              parentDocumentId: ctx.parentDocumentId,
              extractedFrom: ctx.archiveTitle,
              archivePath: entry.filename,
              originalFilename: entry.filename,
            },
            userId: ctx.userId,
            skipAttachmentExtraction: true,
          });

          logger.info('[Archive] Entry stored via vault', {
            parentDocumentId: ctx.parentDocumentId,
            childDocId: result.id,
            filename: entry.filename,
          });

          return {
            filename: entry.filename,
            documentId: result.id,
            status: 'success',
            route: 'vault',
          };
        } catch (vaultErr: any) {
          if (isImageType) {
            // OCR failed for image — fall through to MinIO
            logger.warn('[Archive] OCR failed for image, falling back to MinIO', {
              filename: entry.filename,
              error: vaultErr.message,
            });
          } else {
            throw vaultErr;
          }
        }
      }

      // Route binary/unsupported files to MinIO
      const objectKey = MinioService.generateObjectKey(entry.filename);
      const minioResult = await this.minioService.uploadFile(
        ctx.userId,
        objectKey,
        tempPath,
        mimeType,
      );

      const documentId = uuidv4();
      const storagePath = `${minioResult.bucket}/${minioResult.key}`;

      await this.db.query(
        `INSERT INTO documents
          (id, zakononline_id, type, title, metadata, storage_type, storage_path, file_size, mime_type, user_id, matter_id)
         VALUES ($1, $2, $3, $4, $5, 'minio', $6, $7, $8, $9, $10)`,
        [
          documentId,
          documentId,
          'other',
          entry.filename.replace(/\.[^/.]+$/, ''),
          JSON.stringify({
            ...ctx.metadata,
            folderPath: ctx.folderPath,
            parentDocumentId: ctx.parentDocumentId,
            extractedFrom: ctx.archiveTitle,
            archivePath: entry.filename,
            originalFilename: entry.filename,
            fileSize: entry.size,
            mimeType,
            uploadedAt: new Date().toISOString(),
            minioEtag: minioResult.etag,
            minioBucket: minioResult.bucket,
            minioKey: minioResult.key,
          }),
          storagePath,
          entry.size,
          mimeType,
          ctx.userId,
          ctx.matterId || null,
        ],
      );

      logger.info('[Archive] Entry stored via MinIO', {
        parentDocumentId: ctx.parentDocumentId,
        childDocId: documentId,
        filename: entry.filename,
      });

      return {
        filename: entry.filename,
        documentId,
        status: 'success',
        route: 'minio',
      };
    } catch (err: any) {
      logger.error('[Archive] Failed to process entry', {
        parentDocumentId: ctx.parentDocumentId,
        filename: entry.filename,
        error: err.message,
      });

      return {
        filename: entry.filename,
        status: 'failed',
        error: err.message,
        route: 'vault',
      };
    } finally {
      await fs.unlink(tempPath).catch(() => {});
    }
  }

  /**
   * Guess MIME type from file extension
   */
  private guessMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const map: Record<string, string> = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      html: 'text/html',
      htm: 'text/html',
      txt: 'text/plain',
      rtf: 'application/rtf',
      eml: 'message/rfc822',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      tiff: 'image/tiff',
      tif: 'image/tiff',
      webp: 'image/webp',
      bmp: 'image/bmp',
      gif: 'image/gif',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      xls: 'application/vnd.ms-excel',
      csv: 'text/csv',
      zip: 'application/zip',
      gz: 'application/gzip',
      tgz: 'application/x-tgz',
      tar: 'application/x-tar',
    };
    return map[ext || ''] || 'application/octet-stream';
  }
}
