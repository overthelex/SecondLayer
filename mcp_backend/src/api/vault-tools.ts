import { DocumentParser, ParsedDocument, EmlAttachment } from '../services/document-parser.js';
import { SemanticSectionizer } from '../services/semantic-sectionizer.js';
import { LegalPatternStore } from '../services/legal-pattern-store.js';
import type { IEmbeddingPort } from '../domain/ports/index.js';
import { DocumentService, Document } from '../services/document-service.js';
import { MinioService } from '../services/minio-service.js';
import { MetadataExtractor } from '../services/metadata-extractor.js';
import { UploadService } from '../services/upload-service.js';
import { logger } from '../utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import { DocumentSection } from '../types/index.js';
import fs from 'fs/promises';
import path from 'path';
import { BaseToolHandler, ToolDefinition, ToolResult } from './base-tool-handler.js';

/**
 * Vault Tools API - Stage 4 Implementation
 *
 * Implements document vault with:
 * - Document storage with automatic parsing, sectioning, embedding
 * - Semantic search across vault
 * - Document retrieval with metadata
 * - Filtering and querying
 *
 * Pipeline: store → parse → section → embed → analyze_patterns → save
 */

export interface VaultDocument {
  id: string;
  title: string;
  type: 'contract' | 'legislation' | 'court_decision' | 'internal' | 'other';
  content: string;
  is_encrypted?: boolean;
  metadata: {
    uploadedAt: string;
    uploadedBy?: string;
    tags?: string[];
    category?: string;
    parties?: string[];
    dates?: string[];
    riskLevel?: 'low' | 'medium' | 'high';
    [key: string]: any;
  };
  sections?: DocumentSection[];
  patterns?: {
    riskFactors?: string[];
    keyArguments?: string[];
    confidence?: number;
  };
}

export interface SemanticSearchResult {
  documentId: string;
  title: string;
  relevance: number;
  matchedSections: Array<{
    sectionType: string;
    text: string;
    relevance: number;
  }>;
  metadata: any;
}

export class VaultTools extends BaseToolHandler {
  private minioService?: MinioService;

  constructor(
    private documentParser: DocumentParser,
    private sectionizer: SemanticSectionizer,
    private patternStore: LegalPatternStore,
    private embeddingService: IEmbeddingPort,
    private documentService: DocumentService,
    private metadataExtractor: MetadataExtractor
  ) {
    super();
  }

  setMinioService(minioService: MinioService): void {
    this.minioService = minioService;
  }

  getToolDefinitions() {
    return [
      {
        name: 'store_document',
        description: `Сохранить документ в Vault с автоматической обработкой.

Pipeline:
1. Parse document (PDF/DOCX/HTML → text)
2. Extract sections (semantic sectionizer)
3. Generate embeddings (vector index)
4. Analyze legal patterns (risks/arguments)
5. Save with metadata

Поддерживает:
- Контракты, законодательство, судебные решения
- Автоматическое извлечение метаданных
- Тегирование и категоризация
- Семантический поиск`,
        inputSchema: {
          type: 'object',
          properties: {
            fileBase64: {
              type: 'string',
              description: 'Base64-encoded файл (PDF/DOCX/HTML)',
            },
            mimeType: {
              type: 'string',
              description: 'MIME type документа',
            },
            title: {
              type: 'string',
              description: 'Название документа',
            },
            type: {
              type: 'string',
              enum: ['contract', 'legislation', 'court_decision', 'internal', 'other'],
              description: 'Тип документа',
            },
            metadata: {
              type: 'object',
              description: 'Дополнительные метаданные (tags, category, uploadedBy, etc)',
            },
          },
          required: ['fileBase64', 'title', 'type'],
        },
      },
      {
        name: 'get_document',
        description: `Получить документ из Vault по ID.

Возвращает:
- Полный текст документа
- Метаданные и теги
- Секции (если доступны)
- Результаты анализа паттернов
- История изменений`,
        inputSchema: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description: 'UUID документа в vault',
            },
            includeSections: {
              type: 'boolean',
              description: 'Включить секции документа',
            },
            includePatterns: {
              type: 'boolean',
              description: 'Включить результаты анализа паттернов',
            },
          },
          required: ['documentId'],
        },
      },
      {
        name: 'list_documents',
        description: `Список документов в Vault с фильтрацией и текстовым поиском.

Фильтры:
- По ключевым словам (query) — полнотекстовый поиск по названию и содержимому
- По типу документа
- По тегам
- По категории
- По дате загрузки
- По папке

Поддерживает пагинацию и сортировку. При текстовом поиске результаты ранжируются по релевантности.`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Текстовий пошук по назві та змісту документа (keyword search)',
            },
            type: {
              type: 'string',
              enum: ['contract', 'legislation', 'court_decision', 'internal', 'other'],
              description: 'Фильтр по типу',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Фильтр по тегам (любой из списка)',
            },
            category: {
              type: 'string',
              description: 'Фильтр по категории',
            },
            uploadedAfter: {
              type: 'string',
              description: 'Загружены после даты (ISO 8601)',
            },
            uploadedBefore: {
              type: 'string',
              description: 'Загружены до даты (ISO 8601)',
            },
            limit: {
              type: 'number',
              description: 'Количество результатов (default: 20)',
            },
            offset: {
              type: 'number',
              description: 'Смещение для пагинации',
            },
            sortBy: {
              type: 'string',
              enum: ['uploadedAt', 'title', 'riskLevel'],
              description: 'Поле сортировки',
            },
            sortOrder: {
              type: 'string',
              enum: ['asc', 'desc'],
              description: 'Порядок сортировки',
            },
            folderPath: {
              type: 'string',
              description: 'Фільтр по шляху папки (prefix match)',
            },
            matterId: {
              type: 'string',
              description: 'Фільтр по справі (matter UUID)',
            },
          },
        },
      },
      {
        name: 'semantic_search',
        description: `Семантический поиск по документам в Vault.

Использует векторные эмбеддинги для поиска релевантных документов.

Возможности:
- Поиск по смыслу (не только ключевые слова)
- Фильтрация по типу/категории/тегам
- Ранжирование по релевантности
- Возврат релевантных секций

Примеры:
- "договоры с условием форс-мажор"
- "судебные решения о правах акционеров"
- "риски в контрактах с иностранными контрагентами"`,
        inputSchema: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Поисковый запрос (семантический)',
            },
            type: {
              type: 'string',
              enum: ['contract', 'legislation', 'court_decision', 'internal', 'other'],
              description: 'Фильтр по типу документа',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Фильтр по тегам',
            },
            limit: {
              type: 'number',
              description: 'Количество результатов (default: 10)',
            },
            threshold: {
              type: 'number',
              description: 'Минимальная релевантность 0-1 (default: 0.7)',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'delete_document',
        description: `Видалити документ з Vault (soft-delete).

Видаляє документ, його векторні ембеддінги та файл з MinIO (якщо є).
Потрібно знати ID документа — спочатку використай list_documents для пошуку.

Приклади:
- "Видали документ договір оренди" → спочатку list_documents(query="договір оренди"), потім delete_document(documentId=...)`,
        inputSchema: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description: 'UUID документа в vault',
            },
          },
          required: ['documentId'],
        },
      },
      {
        name: 'update_document',
        description: `Оновити метадані документа в Vault.

Можна змінити:
- title — назву документа
- tags — масив тегів
- type — тип документа (contract, legislation, court_decision, internal, other)
- category — категорію
- folderPath — шлях до папки

Потрібно знати ID документа — спочатку використай list_documents для пошуку.

Приклади:
- "Переименуй документ на 'Новий договір'" → list_documents → update_document(title="Новий договір")
- "Додай тег 'оренда'" → list_documents → update_document(tags=["оренда"])
- "Перенеси в папку Contracts" → list_documents → update_document(folderPath="/Contracts")`,
        inputSchema: {
          type: 'object',
          properties: {
            documentId: {
              type: 'string',
              description: 'UUID документа в vault',
            },
            title: {
              type: 'string',
              description: 'Нова назва документа',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description: 'Нові теги (замінюють існуючі)',
            },
            type: {
              type: 'string',
              enum: ['contract', 'legislation', 'court_decision', 'internal', 'other'],
              description: 'Новий тип документа',
            },
            category: {
              type: 'string',
              description: 'Нова категорія',
            },
            folderPath: {
              type: 'string',
              description: 'Новий шлях до папки',
            },
            matterId: {
              type: ['string', 'null'],
              description: 'UUID справи (null для від\'єднання від справи)',
            },
          },
          required: ['documentId'],
        },
      },
    ];
  }

  /**
   * Store document from file path (used by chunked upload)
   * Same pipeline as storeDocument but reads from disk instead of Base64
   */
  async storeDocumentFromPath(args: {
    filePath: string;
    mimeType?: string;
    title: string;
    type: 'contract' | 'legislation' | 'court_decision' | 'internal' | 'other';
    metadata?: any;
    userId?: string;
    skipAttachmentExtraction?: boolean;
  }): Promise<VaultDocument> {
    const fileBuffer = await fs.readFile(args.filePath);
    const fileBase64 = fileBuffer.toString('base64');

    return this.storeDocument({
      fileBase64,
      mimeType: args.mimeType,
      title: args.title,
      type: args.type,
      metadata: args.metadata,
      userId: args.userId,
      skipAttachmentExtraction: args.skipAttachmentExtraction,
    });
  }

  /**
   * Store document in vault with full processing pipeline
   *
   * Pipeline:
   * 1. Parse document (PDF/DOCX/HTML → text)
   * 2. Extract sections (semantic sectionizer)
   * 3. Generate embeddings for sections
   * 4. Analyze legal patterns
   * 5. Save document + sections + embeddings + metadata
   */
  async storeDocument(args: {
    fileBase64: string;
    mimeType?: string;
    title: string;
    type: 'contract' | 'legislation' | 'court_decision' | 'internal' | 'other';
    metadata?: any;
    userId?: string;
    skipAttachmentExtraction?: boolean;
  }): Promise<VaultDocument> {
    const startTime = Date.now();
    const documentId = uuidv4();

    try {
      logger.info('[Vault] store_document started', {
        documentId,
        title: args.title,
        type: args.type,
        sizeBytes: args.fileBase64.length,
      });

      // Step 1: Parse document
      const fileBuffer = Buffer.from(args.fileBase64, 'base64');
      const parsed: ParsedDocument = await this.documentParser.parseDocument(
        fileBuffer,
        args.mimeType
      );

      logger.info('[Vault] Document parsed', {
        documentId,
        textLength: parsed.text.length,
        pageCount: parsed.metadata.pageCount,
      });

      // Step 1.5: Extract metadata via LLM (date, tags, parties, etc.)
      const extractedMeta = await this.metadataExtractor.extract(
        parsed.text,
        args.type,
        args.title
      );

      logger.info('[Vault] Metadata extracted', {
        documentId,
        documentDate: extractedMeta.documentDate,
        tags: extractedMeta.tags.length,
        parties: extractedMeta.parties.length,
      });

      // Step 2: Extract sections
      const sections = await this.sectionizer.extractSections(parsed.text, false);

      logger.info('[Vault] Sections extracted', {
        documentId,
        sectionCount: sections.length,
      });

      // Step 3: Generate embeddings for full text + sections + chunks in batch
      // Build list of texts: full doc summary, sections, and chunks for large documents
      const textsToEmbed: string[] = [
        parsed.text.slice(0, 8000), // Full document text (summary embedding)
        ...sections.map((s) => s.text.slice(0, 8000)),
      ];

      // For large documents, split into overlapping chunks to ensure all content is searchable
      let chunks: string[] = [];
      if (parsed.text.length > 8000) {
        chunks = this.embeddingService.splitIntoChunks(parsed.text);
        // Add chunks to batch (each chunk is already sized for embedding)
        for (const chunk of chunks) {
          textsToEmbed.push(chunk.slice(0, 8000));
        }
        logger.info('[Vault] Document chunked for embedding', {
          documentId,
          textLength: parsed.text.length,
          chunkCount: chunks.length,
        });
      }

      // Single batch API call instead of N sequential calls
      const allEmbeddings = await this.embeddingService.generateEmbeddingsBatch(textsToEmbed);
      const fullTextEmbedding = allEmbeddings[0];
      const sectionEmbeddings = allEmbeddings.slice(1, 1 + sections.length);
      const chunkEmbeddings = allEmbeddings.slice(1 + sections.length);

      // Store full document embedding
      const embeddingTasks = [];
      const fullTextTask = this.embeddingService.storeVaultChunk({
        id: documentId,
        source: 'zakononline',
        doc_id: documentId,
        section_type: 'FACTS' as any, // Default section type for full doc
        text: parsed.text.slice(0, 1000), // Preview only
        embedding: fullTextEmbedding,
        metadata: {
          date: new Date().toISOString(),
          ...args.metadata,
        },
        created_at: new Date().toISOString(),
      });
      fullTextTask.catch(() => {});
      embeddingTasks.push(fullTextTask);

      // Store section embeddings (all generated above in batch)
      for (let i = 0; i < sections.length; i++) {
        const sectionTask = this.embeddingService.storeVaultChunk({
          id: uuidv4(), // Must be a valid UUID for Qdrant
          source: 'zakononline',
          doc_id: documentId,
          section_type: sections[i].type,
          text: sections[i].text.slice(0, 1000),
          embedding: sectionEmbeddings[i],
          metadata: {
            date: new Date().toISOString(),
            ...args.metadata,
          },
          created_at: new Date().toISOString(),
        });
        sectionTask.catch(() => {});
        embeddingTasks.push(sectionTask);
      }

      // Store chunk embeddings (for large documents)
      for (let i = 0; i < chunks.length; i++) {
        const chunkTask = this.embeddingService.storeVaultChunk({
          id: uuidv4(),
          source: 'zakononline',
          doc_id: documentId,
          section_type: 'CHUNK' as any,
          text: chunks[i].slice(0, 1000),
          embedding: chunkEmbeddings[i],
          metadata: {
            date: new Date().toISOString(),
            chunk_index: i,
            total_chunks: chunks.length,
            ...args.metadata,
          },
          created_at: new Date().toISOString(),
        });
        chunkTask.catch(() => {});
        embeddingTasks.push(chunkTask);
      }

      const embeddingResults = await Promise.allSettled(embeddingTasks);

      const embeddingSuccesses = embeddingResults.filter((r) => r.status === 'fulfilled').length;
      logger.info('[Vault] Embeddings generated', {
        documentId,
        total: embeddingResults.length,
        successful: embeddingSuccesses,
      });

      // Step 4: Analyze legal patterns (extract risks/arguments)
      let patterns: any = {};
      try {
        // Use generic intent for pattern finding
        const patternResults = await this.patternStore.findPatterns(
          args.type || 'general',
          0.5 // minConfidence
        );

        if (patternResults && patternResults.length > 0) {
          // Aggregate patterns from results
          const allRiskFactors: string[] = [];
          const allSuccessArguments: string[] = [];
          let totalConfidence = 0;

          for (const pattern of patternResults) {
            if (pattern.risk_factors) {
              allRiskFactors.push(...pattern.risk_factors);
            }
            if (pattern.success_arguments) {
              allSuccessArguments.push(...pattern.success_arguments);
            }
            totalConfidence += pattern.confidence;
          }

          patterns = {
            riskFactors: [...new Set(allRiskFactors)], // Deduplicate
            keyArguments: [...new Set(allSuccessArguments)],
            confidence: patternResults.length > 0 ? totalConfidence / patternResults.length : 0,
          };
        }
      } catch (error: any) {
        logger.warn('[Vault] Pattern analysis failed, continuing without patterns', {
          documentId,
          error: error.message,
        });
      }

      // Step 5: Save to database (merge extracted metadata)
      const userTags: string[] = args.metadata?.tags || [];
      const mergedTags = [...new Set([...userTags, ...extractedMeta.tags])];

      const document: Document = {
        id: documentId,
        zakononline_id: documentId, // Use same ID for vault documents
        type: args.type,
        title: args.title,
        full_text: parsed.text,
        date: extractedMeta.documentDate || undefined,
        user_id: args.userId,
        metadata: {
          ...parsed.metadata,
          ...args.metadata,
          uploadedAt: new Date().toISOString(),
          processedAt: new Date().toISOString(),
          processingTimeMs: Date.now() - startTime,
          sectionCount: sections.length,
          embeddingCount: embeddingSuccesses,
          patterns,
          documentDate: extractedMeta.documentDate,
          tags: mergedTags,
          parties: extractedMeta.parties,
          jurisdiction: extractedMeta.jurisdiction,
          documentSubtype: extractedMeta.documentSubtype,
        },
      };

      await this.documentService.saveDocument(document);

      // Save sections
      if (sections.length > 0) {
        await this.documentService.saveSections(documentId, sections);
      }

      // Step 6: Extract and store EML attachments as separate documents
      if (parsed.attachments && parsed.attachments.length > 0 && !args.skipAttachmentExtraction) {
        await this.processEmlAttachments(
          parsed.attachments,
          documentId,
          args.title,
          args.metadata,
          args.userId
        );
      }

      const duration = Date.now() - startTime;
      logger.info('[Vault] Document stored successfully', {
        documentId,
        title: args.title,
        type: args.type,
        sections: sections.length,
        embeddings: embeddingSuccesses,
        durationMs: duration,
      });

      return {
        id: documentId,
        title: args.title,
        type: args.type,
        content: parsed.text,
        metadata: document.metadata,
        sections,
        patterns,
      };
    } catch (error: any) {
      logger.error('[Vault] store_document failed', {
        documentId,
        title: args.title,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to store document: ${error.message}`);
    }
  }

  /**
   * Process EML attachments: store document types via vault pipeline, binary types via MinIO
   */
  private async processEmlAttachments(
    attachments: EmlAttachment[],
    parentDocumentId: string,
    emlTitle: string,
    parentMetadata: any,
    userId?: string
  ): Promise<void> {
    // Compute subfolder: strip .eml extension from title
    const baseName = emlTitle.replace(/\.eml$/i, '');
    const parentFolder = parentMetadata?.folderPath || '';
    const attachmentFolder = parentFolder
      ? `${parentFolder.replace(/\/$/, '')}/${baseName}/`
      : `${baseName}/`;

    const tempDir = '/tmp/eml-attachments';
    await fs.mkdir(tempDir, { recursive: true });

    logger.info('[Vault] Processing EML attachments', {
      parentDocumentId,
      attachmentCount: attachments.length,
      attachmentFolder,
    });

    for (const attachment of attachments) {
      const tempPath = path.join(tempDir, `${uuidv4()}-${attachment.filename}`);

      try {
        await fs.writeFile(tempPath, attachment.data);

        const isDocumentType = UploadService.isDocumentType(attachment.mimeType);
        const isImageType = /^image\/(jpeg|png|tiff|webp|bmp)$/.test(attachment.mimeType);

        if (isDocumentType || isImageType) {
          // Route through vault pipeline (parse, section, embed; images go through OCR)
          try {
            const result = await this.storeDocumentFromPath({
              filePath: tempPath,
              mimeType: attachment.mimeType,
              title: attachment.filename.replace(/\.[^/.]+$/, ''),
              type: 'other',
              metadata: {
                ...parentMetadata,
                folderPath: attachmentFolder,
                parentDocumentId,
                extractedFrom: emlTitle,
                originalFilename: attachment.filename,
              },
              userId,
              skipAttachmentExtraction: true,
            });

            logger.info('[Vault] EML attachment stored via vault', {
              parentDocumentId,
              attachmentDocId: result.id,
              filename: attachment.filename,
            });
            continue; // Successfully stored via vault, skip MinIO fallback
          } catch (vaultErr: any) {
            if (isImageType) {
              // OCR failed for image — fall back to MinIO storage below
              logger.warn('[Vault] OCR failed for image EML attachment, falling back to MinIO', {
                parentDocumentId,
                filename: attachment.filename,
                error: vaultErr.message,
              });
            } else {
              // Non-image document type failed — re-throw
              throw vaultErr;
            }
          }
        }

        if (this.minioService && userId) {
          // Route binary files to MinIO
          const objectKey = MinioService.generateObjectKey(attachment.filename);
          const minioResult = await this.minioService.uploadFile(
            userId,
            objectKey,
            tempPath,
            attachment.mimeType
          );

          const documentId = uuidv4();
          const storagePath = `${minioResult.bucket}/${minioResult.key}`;

          // Save metadata record in documents table
          await this.documentService['db'].query(
            `INSERT INTO documents
              (id, zakononline_id, type, title, metadata, storage_type, storage_path, file_size, mime_type, user_id)
             VALUES ($1, $2, $3, $4, $5, 'minio', $6, $7, $8, $9)`,
            [
              documentId,
              documentId,
              'other',
              attachment.filename.replace(/\.[^/.]+$/, ''),
              JSON.stringify({
                ...parentMetadata,
                folderPath: attachmentFolder,
                parentDocumentId,
                extractedFrom: emlTitle,
                originalFilename: attachment.filename,
                fileSize: attachment.data.length,
                mimeType: attachment.mimeType,
                uploadedAt: new Date().toISOString(),
                minioEtag: minioResult.etag,
                minioBucket: minioResult.bucket,
                minioKey: minioResult.key,
              }),
              storagePath,
              attachment.data.length,
              attachment.mimeType,
              userId,
            ]
          );

          logger.info('[Vault] EML attachment stored via MinIO', {
            parentDocumentId,
            attachmentDocId: documentId,
            filename: attachment.filename,
            bucket: minioResult.bucket,
          });
        } else {
          logger.warn('[Vault] Cannot store binary EML attachment — MinIO not configured or no userId', {
            parentDocumentId,
            filename: attachment.filename,
            mimeType: attachment.mimeType,
          });
        }
      } catch (err: any) {
        logger.error('[Vault] Failed to store EML attachment', {
          parentDocumentId,
          filename: attachment.filename,
          error: err.message,
        });
      } finally {
        await fs.unlink(tempPath).catch(() => {});
      }
    }
  }

  /**
   * Get document from vault by ID
   */
  async getDocument(args: {
    documentId: string;
    includeSections?: boolean;
    includePatterns?: boolean;
    userId?: string;
  }): Promise<VaultDocument | null> {
    try {
      logger.info('[Vault] get_document started', {
        documentId: args.documentId,
        includeSections: args.includeSections,
        includePatterns: args.includePatterns,
      });

      const doc = args.userId
        ? await this.documentService.getDocumentForUser(args.documentId, args.userId)
        : await this.documentService.getDocumentById(args.documentId);
      if (!doc) {
        logger.warn('[Vault] Document not found', { documentId: args.documentId });
        return null;
      }

      let content = doc.full_text || '';

      // If full_text is raw EML with MIME attachments, re-parse to extract just the text
      const docMeta = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata || {};
      const mimeType = (doc as any).mime_type || docMeta.mimeType;
      if (mimeType === 'message/rfc822' && content.length > 0) {
        const first500 = content.substring(0, 500);
        const looksRawEml = /^(From|Subject|Date|MIME-Version|Content-Type):\s/mi.test(first500) &&
          (/boundary=/i.test(first500) || /Content-Type:\s*multipart/i.test(first500));
        if (looksRawEml) {
          try {
            const parsed = await this.documentParser.parseEML(Buffer.from(content, 'utf-8'));
            content = parsed.text;
            logger.info('[Vault] Re-parsed raw EML full_text', {
              documentId: args.documentId,
              originalLen: doc.full_text!.length,
              parsedLen: content.length,
            });
          } catch (err: any) {
            logger.warn('[Vault] Failed to re-parse EML, returning raw', {
              documentId: args.documentId,
              error: err.message,
            });
          }
        }
      }

      const result: VaultDocument = {
        id: doc.id!,
        title: doc.title || 'Untitled',
        type: doc.type as any,
        content,
        is_encrypted: (doc as any).is_encrypted || false,
        metadata: docMeta,
      };

      // Include sections if requested
      if (args.includeSections !== false) {
        result.sections = await this.documentService.getSections(args.documentId);
      }

      // Include patterns if requested
      if (args.includePatterns !== false && result.metadata.patterns) {
        result.patterns = result.metadata.patterns;
      }

      logger.info('[Vault] get_document completed', {
        documentId: args.documentId,
        hasContent: !!result.content,
        sectionsCount: result.sections?.length || 0,
      });

      return result;
    } catch (error: any) {
      logger.error('[Vault] get_document failed', {
        documentId: args.documentId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * List documents with filtering
   */
  async listDocuments(args: {
    query?: string;
    type?: string;
    tags?: string[];
    category?: string;
    uploadedAfter?: string;
    uploadedBefore?: string;
    limit?: number;
    offset?: number;
    sortBy?: 'uploadedAt' | 'title' | 'riskLevel';
    sortOrder?: 'asc' | 'desc';
    userId?: string;
    folderPath?: string;
    matterId?: string;
  }): Promise<{ documents: VaultDocument[]; total: number }> {
    try {
      logger.info('[Vault] list_documents started', args);

      const limit = args.limit || 20;
      const offset = args.offset || 0;
      const sortBy = args.sortBy || 'uploadedAt';
      const sortOrder = args.sortOrder || 'desc';

      // Build SQL query with filters
      const conditions: string[] = ['1=1', 'deleted_at IS NULL'];
      const params: any[] = [];
      let paramIndex = 1;

      // User isolation: require userId, return empty if not authenticated
      if (!args.userId) {
        return { documents: [], total: 0 };
      }
      conditions.push(`user_id = $${paramIndex}`);
      params.push(args.userId);
      paramIndex++;

      if (args.type) {
        conditions.push(`type = $${paramIndex}`);
        params.push(args.type);
        paramIndex++;
      }

      if (args.uploadedAfter) {
        conditions.push(`created_at >= $${paramIndex}`);
        params.push(args.uploadedAfter);
        paramIndex++;
      }

      if (args.uploadedBefore) {
        conditions.push(`created_at <= $${paramIndex}`);
        params.push(args.uploadedBefore);
        paramIndex++;
      }

      // Tags filter (check if metadata.tags contains any of the requested tags)
      if (args.tags && args.tags.length > 0) {
        conditions.push(`metadata::jsonb -> 'tags' ?| $${paramIndex}`);
        params.push(args.tags);
        paramIndex++;
      }

      // Category filter
      if (args.category) {
        conditions.push(`metadata::jsonb ->> 'category' = $${paramIndex}`);
        params.push(args.category);
        paramIndex++;
      }

      // Folder path prefix filter — match exact path OR any sub-path
      if (args.folderPath) {
        const cleanFolder = args.folderPath.replace(/\/+$/, '');
        conditions.push(`(metadata::jsonb ->> 'folderPath' = $${paramIndex} OR metadata::jsonb ->> 'folderPath' LIKE $${paramIndex + 1})`);
        params.push(cleanFolder, cleanFolder + '/%');
        paramIndex += 2;
      }

      // Matter filter
      if (args.matterId) {
        conditions.push(`matter_id = $${paramIndex}`);
        params.push(args.matterId);
        paramIndex++;
      }

      // Text search filter (full-text search + ILIKE fallback for short queries)
      const hasTextSearch = !!args.query?.trim();
      let tsQueryParam: number | null = null;
      if (hasTextSearch) {
        const searchText = args.query!.trim();
        // Use tsvector for full-text search
        conditions.push(
          `(search_vector @@ plainto_tsquery('simple', $${paramIndex}) OR title ILIKE $${paramIndex + 1})`
        );
        params.push(searchText);
        params.push(`%${searchText}%`);
        tsQueryParam = paramIndex;
        paramIndex += 2;
      }

      const whereClause = conditions.join(' AND ');

      // Sort mapping — when text search is active, sort by relevance first
      let orderClause: string;
      if (hasTextSearch && tsQueryParam !== null) {
        orderClause = `ts_rank(search_vector, plainto_tsquery('simple', $${tsQueryParam})) DESC, created_at DESC`;
      } else {
        const sortColumn =
          sortBy === 'uploadedAt'
            ? 'created_at'
            : sortBy === 'riskLevel'
            ? "metadata::jsonb -> 'riskLevel'"
            : 'title';
        orderClause = `${sortColumn} ${sortOrder.toUpperCase()}`;
      }

      const query = `
        SELECT id, type, title, metadata, storage_type, mime_type, created_at, updated_at,
               COALESCE(is_encrypted, false) AS is_encrypted,
               CASE WHEN COALESCE(is_encrypted, false) THEN NULL
                    ELSE LEFT(regexp_replace(full_text, '[^\\x20-\\x7E\\u0400-\\u04FF\\u0500-\\u052F\\s]', '', 'g'), 300)
               END AS text_preview
        FROM documents
        WHERE ${whereClause}
        ORDER BY ${orderClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);

      const result = await this.documentService['db'].query(query, params);

      // Get total count
      const countQuery = `SELECT COUNT(*) as total FROM documents WHERE ${whereClause}`;
      const countResult = await this.documentService['db'].query(countQuery, params.slice(0, -2));
      const total = parseInt(countResult.rows[0].total, 10);

      const documents = result.rows.map((row: any) => ({
        id: row.id,
        title: row.title || 'Untitled',
        type: row.type,
        storage_type: row.storage_type || 'vault',
        mime_type: row.mime_type || null,
        is_encrypted: row.is_encrypted || false,
        content: '', // Don't include full content in list
        text_preview: row.text_preview || '',
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata || {},
      }));

      logger.info('[Vault] list_documents completed', {
        total,
        returned: documents.length,
        limit,
        offset,
      });

      return { documents, total };
    } catch (error: any) {
      logger.error('[Vault] list_documents failed', {
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * List unique folder paths (next-level subfolders under prefix)
   */
  async listFolders(args: {
    prefix?: string;
    userId?: string;
  }): Promise<{ folders: string[]; fileCount: number }> {
    try {
      const prefix = args.prefix || '';
      const conditions: string[] = ["metadata::jsonb ->> 'folderPath' IS NOT NULL", 'deleted_at IS NULL'];
      const params: any[] = [];
      let paramIndex = 1;

      // Require userId for folder listing
      if (!args.userId) {
        return { folders: [], fileCount: 0 };
      }
      conditions.push(`user_id = $${paramIndex}`);
      params.push(args.userId);
      paramIndex++;

      if (prefix) {
        conditions.push(`metadata::jsonb ->> 'folderPath' LIKE $${paramIndex}`);
        params.push(prefix + '%');
        paramIndex++;
      }

      const whereClause = conditions.join(' AND ');

      const query = `
        SELECT DISTINCT metadata::jsonb ->> 'folderPath' as folder_path
        FROM documents
        WHERE ${whereClause}
        ORDER BY folder_path
      `;

      const result = await this.documentService['db'].query(query, params);

      // Extract unique next-level subfolder names
      const allPaths: string[] = result.rows.map((r: any) => r.folder_path);
      const prefixDepth = prefix ? prefix.split('/').filter(Boolean).length : 0;
      const folderSet = new Set<string>();
      let fileCount = 0;

      // Skip folderPath values that look like bare file names (no slash, has extension)
      const FILE_EXT_RE = /\.[a-zA-Z0-9]{1,10}$/;

      for (const p of allPaths) {
        // Skip entries that are just a filename (e.g. "contract.pdf") rather than a real folder
        if (!p.includes('/') && FILE_EXT_RE.test(p)) {
          continue;
        }
        const segments = p.split('/').filter(Boolean);
        if (segments.length > prefixDepth) {
          const candidate = segments[prefixDepth];
          // Also skip segment-level entries that look like filenames
          if (!FILE_EXT_RE.test(candidate)) {
            folderSet.add(candidate);
          }
        }
        // Count files at exactly the current prefix level
        if (segments.length === prefixDepth || (prefix && p === prefix)) {
          fileCount++;
        }
      }

      // Also count files that have this exact prefix path
      if (prefix) {
        const countQuery = `
          SELECT COUNT(*) as cnt FROM documents
          WHERE ${whereClause}
          AND metadata::jsonb ->> 'folderPath' = $${paramIndex}
        `;
        const countResult = await this.documentService['db'].query(countQuery, [...params, prefix]);
        fileCount = parseInt(countResult.rows[0].cnt, 10);
      } else {
        // Count all files
        const countQuery = `SELECT COUNT(*) as cnt FROM documents WHERE ${whereClause}`;
        const countResult = await this.documentService['db'].query(countQuery, params);
        fileCount = parseInt(countResult.rows[0].cnt, 10);
      }

      const folders = Array.from(folderSet).sort();

      logger.info('[Vault] listFolders completed', {
        prefix,
        folderCount: folders.length,
        fileCount,
      });

      return { folders, fileCount };
    } catch (error: any) {
      logger.error('[Vault] listFolders failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Semantic search across vault documents
   */
  async semanticSearch(args: {
    query: string;
    type?: string;
    tags?: string[];
    limit?: number;
    threshold?: number;
    userId?: string;
  }): Promise<SemanticSearchResult[]> {
    try {
      logger.info('[Vault] semantic_search started', {
        query: args.query,
        type: args.type,
        limit: args.limit,
      });

      // Require userId for semantic search
      if (!args.userId) {
        return [];
      }

      const limit = args.limit || 10;
      const threshold = args.threshold || 0.7;

      // Generate query embedding
      const queryEmbedding = await this.embeddingService.generateEmbedding(args.query);

      // Search using embedding service
      const searchResults = await this.embeddingService.searchVaultSimilar(
        queryEmbedding,
        {}, // No filters at embedding level, we'll filter below
        limit * 2 // Get more for filtering
      );

      // Filter by score threshold
      let filteredResults = searchResults.filter((r: any) => r.score >= threshold);

      if (args.type || args.tags) {
        // Get metadata for filtering
        const documentIds = filteredResults.map((r: any) => {
          const payload = r.payload || {};
          return payload.doc_id || r.id?.toString().split(':')[0] || '';
        });
        const uniqueIds = [...new Set(documentIds)].filter(Boolean);

        if (uniqueIds.length > 0) {
          const docsQuery = `
            SELECT id, type, title, metadata
            FROM documents
            WHERE id = ANY($1) AND deleted_at IS NULL
            ${args.userId ? 'AND user_id = $2' : ''}
          `;
          const params: any[] = args.userId ? [uniqueIds, args.userId] : [uniqueIds];
          const docsResult = await this.documentService['db'].query(docsQuery, params);
          const docsMap = new Map(docsResult.rows.map((row: any) => [row.id, row]));

          filteredResults = filteredResults.filter((r: any) => {
            const payload = r.payload || {};
            const docId = payload.doc_id || r.id?.toString().split(':')[0];
            const doc = docsMap.get(docId) as any;
            if (!doc) return false;

            if (args.type && doc.type !== args.type) return false;

            if (args.tags && args.tags.length > 0) {
              const metadata =
                typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata;
              const docTags = metadata?.tags || [];
              const hasMatchingTag = args.tags.some((tag: string) => docTags.includes(tag));
              if (!hasMatchingTag) return false;
            }

            return true;
          });
        }
      }

      // Take top results
      filteredResults = filteredResults.slice(0, limit);

      // Format results
      const results: SemanticSearchResult[] = [];
      const processedDocs = new Set<string>();

      for (const searchResult of filteredResults) {
        const payload = searchResult.payload || {};
        const docId = payload.doc_id || searchResult.id?.toString().split(':')[0];
        const sectionType = payload.section_type;

        if (docId && !processedDocs.has(docId)) {
          const doc = args.userId
            ? await this.documentService.getDocumentForUser(docId, args.userId)
            : await this.documentService.getDocumentById(docId);
          if (!doc) continue;

          const metadata =
            typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata || {};

          results.push({
            documentId: docId,
            title: doc.title || 'Untitled',
            relevance: searchResult.score || 0,
            matchedSections: [
              {
                sectionType: sectionType || 'full_text',
                text: payload.text || '',
                relevance: searchResult.score || 0,
              },
            ],
            metadata,
          });

          processedDocs.add(docId);
        }
      }

      logger.info('[Vault] semantic_search completed', {
        query: args.query,
        totalResults: results.length,
        avgRelevance: results.length > 0
          ? results.reduce((sum, r) => sum + r.relevance, 0) / results.length
          : 0,
      });

      return results;
    } catch (error: any) {
      logger.error('[Vault] semantic_search failed', {
        query: args.query,
        error: error.message,
      });

      // Return empty results instead of throwing (graceful degradation)
      logger.warn('[Vault] Returning empty results due to search failure');
      return [];
    }
  }

  /**
   * Extract text from a file buffer using the parse → sectionize → embed pipeline.
   * Used by upload-processor for MinIO-routed files that still need text extraction.
   * Best-effort: returns nulls on failure, never throws.
   */
  async extractTextFromFile(args: {
    fileBuffer: Buffer;
    mimeType: string;
    documentId: string;
    title: string;
    type: string;
    metadata?: any;
    userId?: string;
  }): Promise<{
    fullText: string | null;
    sections: DocumentSection[];
    embeddingCount: number;
  }> {
    try {
      // Step 1: Parse document
      const parsed = await this.documentParser.parseDocument(args.fileBuffer, args.mimeType);

      if (!parsed.text || parsed.text.trim().length <= 10) {
        logger.info('[Vault] extractTextFromFile: no meaningful text extracted', {
          documentId: args.documentId,
          mimeType: args.mimeType,
          textLength: parsed.text?.length || 0,
        });
        return { fullText: null, sections: [], embeddingCount: 0 };
      }

      logger.info('[Vault] extractTextFromFile: text extracted', {
        documentId: args.documentId,
        textLength: parsed.text.length,
        source: parsed.metadata.source,
      });

      // Step 2: Sectionize
      let sections: DocumentSection[] = [];
      try {
        sections = await this.sectionizer.extractSections(parsed.text, false);
      } catch (err: any) {
        logger.warn('[Vault] extractTextFromFile: sectionization failed', {
          documentId: args.documentId,
          error: err.message,
        });
      }

      // Step 3: Generate embeddings (including chunks for large documents)
      let embeddingCount = 0;
      try {
        const textsToEmbed = [
          parsed.text.slice(0, 8000),
          ...sections.map((s) => s.text.slice(0, 8000)),
        ];

        // Chunk large documents for complete coverage
        let chunks: string[] = [];
        if (parsed.text.length > 8000) {
          chunks = this.embeddingService.splitIntoChunks(parsed.text);
          for (const chunk of chunks) {
            textsToEmbed.push(chunk.slice(0, 8000));
          }
          logger.info('[Vault] extractTextFromFile: document chunked', {
            documentId: args.documentId,
            textLength: parsed.text.length,
            chunkCount: chunks.length,
          });
        }

        const allEmbeddings = await this.embeddingService.generateEmbeddingsBatch(textsToEmbed);
        const fullTextEmbedding = allEmbeddings[0];
        const sectionEmbeddings = allEmbeddings.slice(1, 1 + sections.length);
        const chunkEmbeddings = allEmbeddings.slice(1 + sections.length);

        const embeddingTasks = [];

        // Store full document embedding
        const fullTextTask = this.embeddingService.storeVaultChunk({
          id: args.documentId,
          source: 'zakononline',
          doc_id: args.documentId,
          section_type: 'FACTS' as any,
          text: parsed.text.slice(0, 1000),
          embedding: fullTextEmbedding,
          metadata: {
            date: new Date().toISOString(),
            ...args.metadata,
          },
          created_at: new Date().toISOString(),
        });
        fullTextTask.catch(() => {});
        embeddingTasks.push(fullTextTask);

        // Store section embeddings
        for (let i = 0; i < sections.length; i++) {
          const sectionTask = this.embeddingService.storeVaultChunk({
            id: uuidv4(),
            source: 'zakononline',
            doc_id: args.documentId,
            section_type: sections[i].type,
            text: sections[i].text.slice(0, 1000),
            embedding: sectionEmbeddings[i],
            metadata: {
              date: new Date().toISOString(),
              ...args.metadata,
            },
            created_at: new Date().toISOString(),
          });
          sectionTask.catch(() => {});
          embeddingTasks.push(sectionTask);
        }

        // Store chunk embeddings
        for (let i = 0; i < chunks.length; i++) {
          const chunkTask = this.embeddingService.storeVaultChunk({
            id: uuidv4(),
            source: 'zakononline',
            doc_id: args.documentId,
            section_type: 'CHUNK' as any,
            text: chunks[i].slice(0, 1000),
            embedding: chunkEmbeddings[i],
            metadata: {
              date: new Date().toISOString(),
              chunk_index: i,
              total_chunks: chunks.length,
              ...args.metadata,
            },
            created_at: new Date().toISOString(),
          });
          chunkTask.catch(() => {});
          embeddingTasks.push(chunkTask);
        }

        const results = await Promise.allSettled(embeddingTasks);
        embeddingCount = results.filter((r) => r.status === 'fulfilled').length;

        logger.info('[Vault] extractTextFromFile: embeddings stored', {
          documentId: args.documentId,
          embeddingCount,
          total: results.length,
        });
      } catch (err: any) {
        logger.warn('[Vault] extractTextFromFile: embedding generation failed', {
          documentId: args.documentId,
          error: err.message,
        });
      }

      return {
        fullText: parsed.text,
        sections,
        embeddingCount,
      };
    } catch (error: any) {
      logger.warn('[Vault] extractTextFromFile failed (best-effort)', {
        documentId: args.documentId,
        mimeType: args.mimeType,
        error: error.message,
      });
      return { fullText: null, sections: [], embeddingCount: 0 };
    }
  }

  /**
   * Delete document (soft-delete) with cleanup of vectors and MinIO
   */
  async deleteDocument(args: {
    documentId: string;
    userId?: string;
  }): Promise<{ deleted: boolean; title?: string; error?: string }> {
    try {
      logger.info('[Vault] delete_document started', { documentId: args.documentId, userId: args.userId });

      if (!args.userId) {
        return { deleted: false, error: 'Authentication required' };
      }

      // Verify ownership and get doc info
      const docResult = await this.documentService['db'].query(
        `SELECT id, title, storage_type, storage_path, user_id, metadata
         FROM documents WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [args.documentId, args.userId]
      );

      if (docResult.rows.length === 0) {
        return { deleted: false, error: 'Document not found or access denied' };
      }

      const doc = docResult.rows[0];

      // Soft-delete the document
      await this.documentService['db'].query(
        `UPDATE documents SET deleted_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [args.documentId]
      );

      // Cleanup Qdrant vectors
      try {
        await this.embeddingService.deleteVaultByDocId(args.documentId);
        logger.info('[Vault] Vectors deleted for document', { documentId: args.documentId });
      } catch (err: any) {
        logger.warn('[Vault] Failed to delete vectors', { documentId: args.documentId, error: err.message });
      }

      // Cleanup MinIO object if stored there
      if (doc.storage_type === 'minio' && doc.storage_path && this.minioService) {
        try {
          const meta = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata || {};
          const objectKey = meta.minioKey || doc.storage_path.split('/').pop();
          if (objectKey) {
            await this.minioService.deleteFile(args.userId, objectKey);
            logger.info('[Vault] MinIO object deleted', { documentId: args.documentId, objectKey });
          }
        } catch (err: any) {
          logger.warn('[Vault] Failed to delete MinIO object', { documentId: args.documentId, error: err.message });
        }
      }

      logger.info('[Vault] delete_document completed', { documentId: args.documentId, title: doc.title });
      return { deleted: true, title: doc.title };
    } catch (error: any) {
      logger.error('[Vault] delete_document failed', { documentId: args.documentId, error: error.message });
      return { deleted: false, error: error.message };
    }
  }

  /**
   * Update document metadata
   */
  async updateDocument(args: {
    documentId: string;
    userId?: string;
    title?: string;
    tags?: string[];
    type?: string;
    category?: string;
    folderPath?: string;
    matterId?: string | null;
  }): Promise<{ updated: boolean; document?: { id: string; title: string; type: string; metadata: any }; error?: string }> {
    try {
      logger.info('[Vault] update_document started', args);

      if (!args.userId) {
        return { updated: false, error: 'Authentication required' };
      }

      // Verify ownership
      const docResult = await this.documentService['db'].query(
        `SELECT id, title, type, metadata FROM documents WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
        [args.documentId, args.userId]
      );

      if (docResult.rows.length === 0) {
        return { updated: false, error: 'Document not found or access denied' };
      }

      const doc = docResult.rows[0];
      const currentMeta = typeof doc.metadata === 'string' ? JSON.parse(doc.metadata) : doc.metadata || {};

      // Build dynamic SET clause
      const setClauses: string[] = ['updated_at = NOW()'];
      const params: any[] = [];
      let paramIdx = 1;

      if (args.title !== undefined) {
        setClauses.push(`title = $${paramIdx++}`);
        params.push(args.title);
      }

      if (args.type !== undefined) {
        setClauses.push(`type = $${paramIdx++}`);
        params.push(args.type);
      }

      if (args.matterId !== undefined) {
        setClauses.push(`matter_id = $${paramIdx++}`);
        params.push(args.matterId);
      }

      // Merge metadata fields: tags, category, folderPath
      const metaUpdates: Record<string, any> = {};
      if (args.tags !== undefined) metaUpdates.tags = args.tags;
      if (args.category !== undefined) metaUpdates.category = args.category;
      if (args.folderPath !== undefined) metaUpdates.folderPath = args.folderPath;

      if (Object.keys(metaUpdates).length > 0) {
        const mergedMeta = { ...currentMeta, ...metaUpdates };
        setClauses.push(`metadata = $${paramIdx++}`);
        params.push(JSON.stringify(mergedMeta));
      }

      // Add WHERE params
      params.push(args.documentId);
      params.push(args.userId);

      await this.documentService['db'].query(
        `UPDATE documents SET ${setClauses.join(', ')} WHERE id = $${paramIdx++} AND user_id = $${paramIdx++} AND deleted_at IS NULL`,
        params
      );

      // Fetch updated doc
      const updated = await this.documentService['db'].query(
        `SELECT id, title, type, metadata FROM documents WHERE id = $1`,
        [args.documentId]
      );

      const updatedDoc = updated.rows[0];
      const updatedMeta = typeof updatedDoc.metadata === 'string' ? JSON.parse(updatedDoc.metadata) : updatedDoc.metadata || {};

      logger.info('[Vault] update_document completed', { documentId: args.documentId });
      return {
        updated: true,
        document: {
          id: updatedDoc.id,
          title: updatedDoc.title,
          type: updatedDoc.type,
          metadata: updatedMeta,
        },
      };
    } catch (error: any) {
      logger.error('[Vault] update_document failed', { documentId: args.documentId, error: error.message });
      return { updated: false, error: error.message };
    }
  }

  async executeTool(name: string, args: any): Promise<ToolResult | null> {
    switch (name) {
      case 'store_document':
        return this.wrapResponse(await this.storeDocument(args));
      case 'get_document':
        return this.wrapResponse(await this.getDocument(args));
      case 'list_documents':
        return this.wrapResponse(await this.listDocuments(args));
      case 'semantic_search':
        return this.wrapResponse(await this.semanticSearch(args));
      case 'delete_document':
        return this.wrapResponse(await this.deleteDocument(args));
      case 'update_document':
        return this.wrapResponse(await this.updateDocument(args));
      default:
        return null;
    }
  }
}
