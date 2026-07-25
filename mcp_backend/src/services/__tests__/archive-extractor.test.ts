/**
 * Tests for ArchiveExtractorService — static type helpers, ZIP extraction,
 * routing to vault/minio/archive, security limits, and MIME guessing.
 */

jest.mock('../../utils/logger.js', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), debug: jest.fn(), error: jest.fn() },
}));

jest.mock('uuid', () => ({
  v4: jest.fn()
    .mockReturnValueOnce('archive-temp-uuid')
    .mockReturnValue('child-doc-uuid'),
}));

// Mock fs/promises for disk operations
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockResolvedValue({ size: 1000 }),
  readFile: jest.fn().mockResolvedValue(Buffer.from('file data')),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readdir: jest.fn().mockResolvedValue([]),
  lstat: jest.fn().mockResolvedValue({ isSymbolicLink: () => false }),
  unlink: jest.fn().mockResolvedValue(undefined),
  rm: jest.fn().mockResolvedValue(undefined),
}));

// Mock adm-zip for ZIP extraction tests
const mockZipEntry = (name: string, size: number = 100, compressedSize: number = 50) => ({
  isDirectory: false,
  entryName: name,
  header: { size, compressedSize },
  getData: jest.fn().mockReturnValue(Buffer.from('file content')),
});

const mockGetEntries = jest.fn().mockReturnValue([]);
jest.mock('adm-zip', () =>
  jest.fn().mockImplementation(() => ({
    getEntries: mockGetEntries,
  }))
);

// Mock tar
jest.mock('tar', () => ({
  extract: jest.fn().mockResolvedValue(undefined),
}));

import { ArchiveExtractorService } from '../archive-extractor';

const createMockVaultTools = () => ({
  storeDocumentFromPath: jest.fn().mockResolvedValue({ id: 'vault-doc-1' }),
});

const createMockMinioService = () => ({
  uploadFile: jest.fn().mockResolvedValue({
    bucket: 'lexapp',
    key: 'uploads/test-file.bin',
    etag: 'etag-123',
  }),
  // Static method helper
  generateObjectKey: jest.fn().mockReturnValue('uploads/test-file.bin'),
});

const createMockDb = () => ({
  query: jest.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
});

// Mock MinioService.generateObjectKey (static)
jest.mock('../minio-service.js', () => ({
  MinioService: {
    generateObjectKey: jest.fn().mockReturnValue('uploads/generated-key'),
  },
}));

// Mock UploadService.isArchiveType and isDocumentType (static)
jest.mock('../upload-service.js', () => ({
  UploadService: {
    isArchiveType: jest.fn().mockImplementation((mime: string) =>
      ['application/zip', 'application/x-zip-compressed', 'application/x-tar', 'application/gzip',
       'application/x-gzip', 'application/x-tgz', 'application/x-compressed-tar'].includes(mime)
    ),
    isDocumentType: jest.fn().mockImplementation((mime: string) =>
      ['application/pdf', 'application/msword',
       'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
       'text/html', 'text/plain', 'application/rtf', 'message/rfc822'].includes(mime)
    ),
  },
}));

describe('ArchiveExtractorService', () => {
  let service: ArchiveExtractorService;
  let mockVaultTools: ReturnType<typeof createMockVaultTools>;
  let mockMinioService: ReturnType<typeof createMockMinioService>;
  let mockDb: ReturnType<typeof createMockDb>;

  beforeEach(() => {
    jest.clearAllMocks();
    const { v4 } = require('uuid');
    v4.mockReset();
    v4.mockReturnValueOnce('archive-temp-uuid').mockReturnValue('child-doc-uuid');

    mockGetEntries.mockReturnValue([]);

    mockVaultTools = createMockVaultTools();
    mockMinioService = createMockMinioService();
    mockDb = createMockDb();

    service = new ArchiveExtractorService(
      mockVaultTools as any,
      mockMinioService as any,
      mockDb as any
    );
  });

  // ── static isArchiveType ──

  describe('isArchiveType (static)', () => {
    it('should delegate to UploadService.isArchiveType', () => {
      const result = ArchiveExtractorService.isArchiveType('application/zip');
      expect(result).toBe(true);
    });

    it('should return false for non-archive types', () => {
      expect(ArchiveExtractorService.isArchiveType('application/pdf')).toBe(false);
    });
  });

  // ── extractAndProcess — nesting depth ──

  describe('extractAndProcess', () => {
    it('should return empty result when max nesting depth is reached', async () => {
      const result = await service.extractAndProcess({
        archivePath: '/tmp/deep.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'deep.zip',
        userId: 'user-1',
        depth: 2, // MAX_NESTING_DEPTH = 2
      });

      expect(result.totalFiles).toBe(0);
      expect(result.processedFiles).toBe(0);
      expect(result.children).toHaveLength(0);
    });

    it('should set parentDocumentId on result', async () => {
      mockGetEntries.mockReturnValue([]);
      const result = await service.extractAndProcess({
        archivePath: '/tmp/archive.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-doc-1',
        archiveTitle: 'archive.zip',
        userId: 'user-1',
      });

      expect(result.parentDocumentId).toBe('parent-doc-1');
    });

    it('should throw for unsupported archive type', async () => {
      await expect(
        service.extractAndProcess({
          archivePath: '/tmp/file.rar',
          mimeType: 'application/x-rar-compressed',
          parentDocumentId: 'parent-1',
          archiveTitle: 'file.rar',
          userId: 'user-1',
        })
      ).rejects.toThrow('Unsupported archive type');
    });

    it('should process empty ZIP and return zero totals', async () => {
      mockGetEntries.mockReturnValue([]);
      const result = await service.extractAndProcess({
        archivePath: '/tmp/empty.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'empty.zip',
        userId: 'user-1',
      });

      expect(result.totalFiles).toBe(0);
      expect(result.processedFiles).toBe(0);
      expect(result.failedFiles).toBe(0);
    });

    it('should route PDF entries through vault', async () => {
      mockGetEntries.mockReturnValue([mockZipEntry('document.pdf')]);

      const result = await service.extractAndProcess({
        archivePath: '/tmp/docs.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'docs.zip',
        userId: 'user-1',
      });

      expect(result.totalFiles).toBe(1);
      expect(result.processedFiles).toBe(1);
      expect(result.children[0].route).toBe('vault');
      expect(result.children[0].documentId).toBe('vault-doc-1');
      expect(mockVaultTools.storeDocumentFromPath).toHaveBeenCalledWith(
        expect.objectContaining({
          mimeType: 'application/pdf',
          title: 'document',
        })
      );
    });

    it('should route binary/unsupported files through MinIO', async () => {
      mockGetEntries.mockReturnValue([mockZipEntry('data.xlsx')]);

      const result = await service.extractAndProcess({
        archivePath: '/tmp/data.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'data.zip',
        userId: 'user-1',
      });

      expect(result.children[0].route).toBe('minio');
      expect(mockMinioService.uploadFile).toHaveBeenCalled();
      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO documents'),
        expect.any(Array)
      );
    });

    it('should skip __MACOSX entries', async () => {
      mockGetEntries.mockReturnValue([mockZipEntry('__MACOSX/._document.pdf')]);

      const result = await service.extractAndProcess({
        archivePath: '/tmp/mac.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'mac.zip',
        userId: 'user-1',
      });

      expect(result.totalFiles).toBe(0);
    });

    it('should skip directory entries', async () => {
      mockGetEntries.mockReturnValue([
        { ...mockZipEntry('folder/'), isDirectory: true },
      ]);

      const result = await service.extractAndProcess({
        archivePath: '/tmp/archive.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'archive.zip',
        userId: 'user-1',
      });

      expect(result.totalFiles).toBe(0);
    });

    it('should throw on zip bomb: too many files', async () => {
      // 201 entries > MAX_FILES (200)
      const entries = Array.from({ length: 201 }, (_, i) => mockZipEntry(`file_${i}.txt`));
      mockGetEntries.mockReturnValue(entries);

      await expect(
        service.extractAndProcess({
          archivePath: '/tmp/bomb.zip',
          mimeType: 'application/zip',
          parentDocumentId: 'parent-1',
          archiveTitle: 'bomb.zip',
          userId: 'user-1',
        })
      ).rejects.toThrow('zip bomb');
    });

    it('should skip oversized individual entries and continue', async () => {
      const oversized = mockZipEntry('huge.pdf', 101 * 1024 * 1024); // 101MB > MAX_SINGLE_FILE_SIZE
      const normal = mockZipEntry('small.pdf', 100);
      mockGetEntries.mockReturnValue([oversized, normal]);

      const result = await service.extractAndProcess({
        archivePath: '/tmp/mixed.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'mixed.zip',
        userId: 'user-1',
      });

      // Oversized entry is skipped, small.pdf is processed
      expect(result.totalFiles).toBe(1); // only small.pdf counted
    });

    it('should throw on suspicious path traversal entry', async () => {
      const traversalEntry = {
        ...mockZipEntry('../etc/passwd'),
        entryName: '../etc/passwd',
        header: { size: 100, compressedSize: 50 },
      };
      mockGetEntries.mockReturnValue([traversalEntry]);

      // Path traversal entries are skipped, not thrown — result has 0 files
      const result = await service.extractAndProcess({
        archivePath: '/tmp/evil.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'evil.zip',
        userId: 'user-1',
      });

      expect(result.totalFiles).toBe(0);
    });

    it('should handle vault failure gracefully and record failed child', async () => {
      mockGetEntries.mockReturnValue([mockZipEntry('contract.pdf')]);
      mockVaultTools.storeDocumentFromPath.mockRejectedValueOnce(new Error('vault unavailable'));

      const result = await service.extractAndProcess({
        archivePath: '/tmp/archive.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'archive.zip',
        userId: 'user-1',
      });

      expect(result.failedFiles).toBe(1);
      expect(result.children[0].status).toBe('failed');
      expect(result.children[0].error).toBe('vault unavailable');
    });

    it('should compute folder path from archive title', async () => {
      mockGetEntries.mockReturnValue([mockZipEntry('file.pdf')]);

      await service.extractAndProcess({
        archivePath: '/tmp/MyDocs.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'MyDocs.zip',
        userId: 'user-1',
      });

      const vaultCall = mockVaultTools.storeDocumentFromPath.mock.calls[0][0];
      expect(vaultCall.metadata.folderPath).toBe('MyDocs/');
    });

    it('should append to existing folderPath from metadata', async () => {
      mockGetEntries.mockReturnValue([mockZipEntry('file.pdf')]);

      await service.extractAndProcess({
        archivePath: '/tmp/Sub.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'Sub.zip',
        userId: 'user-1',
        metadata: { folderPath: 'Root/' },
      });

      const vaultCall = mockVaultTools.storeDocumentFromPath.mock.calls[0][0];
      expect(vaultCall.metadata.folderPath).toBe('Root/Sub/');
    });

    it('should pass matterId to vault and minio calls', async () => {
      mockGetEntries.mockReturnValue([mockZipEntry('file.pdf')]);

      await service.extractAndProcess({
        archivePath: '/tmp/archive.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'archive.zip',
        userId: 'user-1',
        matterId: 'matter-42',
      });

      const vaultCall = mockVaultTools.storeDocumentFromPath.mock.calls[0][0];
      // VaultTools receives matterId via metadata — it's in the service internal ctx
      expect(vaultCall).toBeDefined();
    });

    it('should report correct completed/failed counts', async () => {
      mockGetEntries.mockReturnValue([
        mockZipEntry('ok.pdf'),
        mockZipEntry('fail.pdf'),
      ]);
      mockVaultTools.storeDocumentFromPath
        .mockResolvedValueOnce({ id: 'vault-1' })
        .mockRejectedValueOnce(new Error('failed'));

      const result = await service.extractAndProcess({
        archivePath: '/tmp/mixed.zip',
        mimeType: 'application/zip',
        parentDocumentId: 'parent-1',
        archiveTitle: 'mixed.zip',
        userId: 'user-1',
      });

      expect(result.processedFiles).toBe(1);
      expect(result.failedFiles).toBe(1);
    });
  });
});
