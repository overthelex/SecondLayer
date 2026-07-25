/**
 * Tests for DocumentParser — MIME detection, plain text parsing,
 * RTF parsing, parseDocument routing, and encoding detection.
 *
 * Heavy IO methods (PDF, DOCX, HTML) are tested at integration level
 * since they require Playwright/pdfjs. Here we focus on unit-testable logic.
 */

// Mock external dependencies
jest.mock('playwright', () => ({
  chromium: { launch: jest.fn() },
}));
jest.mock('@google-cloud/vision', () => ({
  ImageAnnotatorClient: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('mammoth', () => ({ default: { convertToHtml: jest.fn() } }));
jest.mock('word-extractor', () => jest.fn().mockImplementation(() => ({ extract: jest.fn() })));
jest.mock('exceljs', () => ({ Workbook: jest.fn() }));
jest.mock('adm-zip', () => jest.fn().mockImplementation(() => ({
  getEntries: jest.fn().mockReturnValue([]),
  readAsText: jest.fn().mockReturnValue(''),
})));
jest.mock('cheerio', () => ({ load: jest.fn() }));
jest.mock('uuid', () => ({ v4: jest.fn().mockReturnValue('test-uuid') }));
jest.mock('fs', () => ({
  existsSync: jest.fn().mockReturnValue(false),
}));
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../utils/logger.js', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    error: jest.fn(),
  },
}));

import { DocumentParser } from '../document-parser';

describe('DocumentParser', () => {
  let parser: DocumentParser;

  beforeEach(() => {
    parser = new DocumentParser('/nonexistent/key.json');
  });

  describe('parsePlainText', () => {
    it('should parse UTF-8 text', async () => {
      const buffer = Buffer.from('Привіт, світ!', 'utf-8');
      const result = await parser.parsePlainText(buffer);

      expect(result.text).toBe('Привіт, світ!');
      expect(result.metadata.source).toBe('native');
      expect(result.metadata.mimeType).toBe('text/plain');
    });

    it('should handle UTF-8 BOM', async () => {
      const bom = Buffer.from([0xEF, 0xBB, 0xBF]);
      const text = Buffer.from('Hello BOM', 'utf-8');
      const buffer = Buffer.concat([bom, text]);

      const result = await parser.parsePlainText(buffer);
      expect(result.text).toBe('Hello BOM');
    });

    it('should handle UTF-16 LE BOM', async () => {
      const bom = Buffer.from([0xFF, 0xFE]);
      const text = Buffer.from('Hi', 'utf16le');
      const buffer = Buffer.concat([bom, text]);

      const result = await parser.parsePlainText(buffer);
      expect(result.text).toBe('Hi');
    });

    it('should throw on empty text', async () => {
      const buffer = Buffer.from('   \n  \t  ', 'utf-8');

      await expect(parser.parsePlainText(buffer)).rejects.toThrow('Plain text file is empty');
    });

    it('should handle ASCII text', async () => {
      const buffer = Buffer.from('Simple ASCII text content');
      const result = await parser.parsePlainText(buffer);

      expect(result.text).toBe('Simple ASCII text content');
    });
  });

  describe('parseRTF', () => {
    it('should strip RTF control sequences and extract text', async () => {
      const rtf = 'Hello World \\par Second line';
      const buffer = Buffer.from(rtf, 'latin1');

      const result = await parser.parseRTF(buffer);

      expect(result.text).toContain('Hello World');
      expect(result.text).toContain('Second line');
      expect(result.metadata.source).toBe('native');
      expect(result.metadata.mimeType).toBe('application/rtf');
    });

    it('should convert \\par to newlines', async () => {
      const rtf = 'First paragraph\\par Second paragraph';
      const buffer = Buffer.from(rtf, 'latin1');

      const result = await parser.parseRTF(buffer);
      expect(result.text).toContain('First paragraph');
      expect(result.text).toContain('\n');
      expect(result.text).toContain('Second paragraph');
    });

    it('should convert \\tab to tabs', async () => {
      const rtf = 'Column1\\tab Column2';
      const buffer = Buffer.from(rtf, 'latin1');

      const result = await parser.parseRTF(buffer);
      expect(result.text).toContain('\t');
    });

    it('should decode hex escapes for Windows-1251 bytes', async () => {
      // \'cf = 0xCF = П in Windows-1251
      const rtf = "Text \\'cf end";
      const buffer = Buffer.from(rtf, 'latin1');

      const result = await parser.parseRTF(buffer);
      expect(result.text).toContain('П');
    });

    it('should throw on empty RTF', async () => {
      const rtf = '{\\rtf1\\ansi {\\fonttbl}}';
      const buffer = Buffer.from(rtf, 'latin1');

      await expect(parser.parseRTF(buffer)).rejects.toThrow('RTF file contains no extractable text');
    });
  });

  describe('detectMimeType (via parseDocument routing)', () => {
    // We test detectMimeType indirectly through parseDocument,
    // or directly by accessing private method via bracket notation

    it('should detect PDF by magic bytes', () => {
      const pdfHeader = Buffer.from('%PDF-1.4 fake content', 'utf-8');
      const mimeType = (parser as any).detectMimeType(pdfHeader);
      expect(mimeType).toBe('application/pdf');
    });

    it('should detect ZIP/DOCX by magic bytes', () => {
      const zipHeader = Buffer.alloc(200);
      zipHeader[0] = 0x50; // P
      zipHeader[1] = 0x4B; // K
      zipHeader[2] = 0x03;
      zipHeader[3] = 0x04;

      const mimeType = (parser as any).detectMimeType(zipHeader);
      expect(mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    });

    it('should detect OLE DOC by magic bytes', () => {
      const oleHeader = Buffer.alloc(200);
      oleHeader[0] = 0xD0;
      oleHeader[1] = 0xCF;
      oleHeader[2] = 0x11;
      oleHeader[3] = 0xE0;

      const mimeType = (parser as any).detectMimeType(oleHeader);
      expect(mimeType).toBe('application/msword');
    });

    it('should detect RTF by {\\rtf prefix', () => {
      const rtfContent = Buffer.from('{\\rtf1\\ansi some content here that is long enough', 'utf-8');
      const mimeType = (parser as any).detectMimeType(rtfContent);
      expect(mimeType).toBe('application/rtf');
    });

    it('should detect HTML by <html tag', () => {
      const html = Buffer.from('<html><body>Hello</body></html>', 'utf-8');
      const mimeType = (parser as any).detectMimeType(html);
      expect(mimeType).toBe('text/html');
    });

    it('should detect HTML by <!doctype html>', () => {
      const html = Buffer.from('<!DOCTYPE html><html></html>', 'utf-8');
      const mimeType = (parser as any).detectMimeType(html);
      expect(mimeType).toBe('text/html');
    });

    it('should detect EML by email headers', () => {
      const eml = Buffer.from(
        'From: sender@test.com\r\nSubject: Test\r\nDate: Mon, 1 Jan 2024\r\nContent-Type: multipart/mixed; boundary=abc\r\n\r\nBody',
        'utf-8'
      );
      const mimeType = (parser as any).detectMimeType(eml);
      expect(mimeType).toBe('message/rfc822');
    });

    it('should fall back to text/plain for printable content', () => {
      const text = Buffer.from('Just regular plain text without any markers', 'utf-8');
      const mimeType = (parser as any).detectMimeType(text);
      expect(mimeType).toBe('text/plain');
    });
  });

  describe('parseDocument routing', () => {
    it('should route text/plain to parsePlainText', async () => {
      const buffer = Buffer.from('Test content', 'utf-8');
      const spy = jest.spyOn(parser, 'parsePlainText');

      await parser.parseDocument(buffer, 'text/plain');

      expect(spy).toHaveBeenCalledWith(buffer);
    });

    it('should route application/rtf to parseRTF', async () => {
      const buffer = Buffer.from('Some RTF content', 'latin1');
      const spy = jest.spyOn(parser, 'parseRTF');

      await parser.parseDocument(buffer, 'application/rtf');

      expect(spy).toHaveBeenCalledWith(buffer);
    });

    it('should route text/csv to parsePlainText', async () => {
      const buffer = Buffer.from('col1,col2\nval1,val2', 'utf-8');
      const spy = jest.spyOn(parser, 'parsePlainText');

      await parser.parseDocument(buffer, 'text/csv');

      expect(spy).toHaveBeenCalledWith(buffer);
    });

    it('should auto-detect MIME type when not provided', async () => {
      const buffer = Buffer.from('Simple text for auto-detection', 'utf-8');
      const spy = jest.spyOn(parser, 'parsePlainText');

      await parser.parseDocument(buffer);

      expect(spy).toHaveBeenCalled();
    });

    it('should detect msword with ZIP header as DOCX', async () => {
      // Create a buffer that starts with PK (ZIP)
      const zipBuffer = Buffer.alloc(100);
      zipBuffer[0] = 0x50;
      zipBuffer[1] = 0x4B;
      zipBuffer[2] = 0x03;
      zipBuffer[3] = 0x04;

      const spy = jest.spyOn(parser, 'parseDOCX').mockResolvedValue({
        text: 'docx content',
        metadata: { source: 'native', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      });

      await parser.parseDocument(zipBuffer, 'application/msword');

      expect(spy).toHaveBeenCalled();
    });
  });

  describe('initialize', () => {
    it('should create temp directory', async () => {
      const fsp = require('fs/promises');

      await parser.initialize();

      expect(fsp.mkdir).toHaveBeenCalledWith('/tmp/document-parser', { recursive: true });
    });
  });

  describe('EML header decoding', () => {
    it('should decode RFC 2047 encoded words', () => {
      const decoded = (parser as any).decodeEncodedWords('=?UTF-8?B?0J/RgNC40LLRltGC?=');
      expect(decoded).toBe('Привіт');
    });

    it('should decode quoted-printable encoded words', () => {
      const decoded = (parser as any).decodeEncodedWords('=?UTF-8?Q?Hello_World?=');
      expect(decoded).toBe('Hello World');
    });

    it('should return plain text unchanged', () => {
      const decoded = (parser as any).decodeEncodedWords('Plain Subject');
      expect(decoded).toBe('Plain Subject');
    });
  });

  describe('decodeMimeContent', () => {
    it('should decode base64 content', () => {
      const encoded = Buffer.from('Hello World').toString('base64');
      const decoded = (parser as any).decodeMimeContent(encoded, 'base64');
      expect(decoded).toContain('Hello World');
    });

    it('should decode quoted-printable content', () => {
      const decoded = (parser as any).decodeMimeContent('Hello=20World', 'quoted-printable');
      expect(decoded).toContain('Hello World');
    });

    it('should return 7bit/8bit content unchanged', () => {
      const decoded = (parser as any).decodeMimeContent('Plain text', '7bit');
      expect(decoded).toBe('Plain text');
    });
  });
});
