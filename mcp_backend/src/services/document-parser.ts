import { chromium, Browser } from 'playwright';
import { ImageAnnotatorClient } from '@google-cloud/vision';
import mammoth from 'mammoth';
// @ts-ignore — no type declarations available
import WordExtractor from 'word-extractor';
import ExcelJS from 'exceljs';
import AdmZip from 'adm-zip';
import { load as cheerioLoad } from 'cheerio';
import { logger } from '../utils/logger.js';
import type { ILLMPort } from '../domain/ports/index.js';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

/**
 * Locate the pdfjs-dist/build directory across possible node_modules paths.
 */
function findPdfJsBuildDir(): string {
  const candidates = [
    path.resolve(__dirname, '..', '..', 'node_modules', 'pdfjs-dist', 'build'),
    path.resolve(__dirname, '..', '..', '..', 'node_modules', 'pdfjs-dist', 'build'),
    path.resolve(__dirname, '..', '..', '..', '..', 'node_modules', 'pdfjs-dist', 'build'),
  ];
  for (const dir of candidates) {
    if (fsSync.existsSync(path.join(dir, 'pdf.min.mjs'))) {
      return dir;
    }
  }
  throw new Error('pdfjs-dist build directory not found. Searched: ' + candidates.join(', '));
}

export interface EmlAttachment {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface ParsedDocument {
  text: string;
  metadata: {
    title?: string;
    author?: string;
    createdDate?: Date;
    modifiedDate?: Date;
    pageCount?: number;
    source: 'native' | 'ocr';
    mimeType: string;
  };
  pages?: Array<{
    pageNumber: number;
    text: string;
    confidence?: number;
  }>;
  attachments?: EmlAttachment[];
}

export class DocumentParser {
  private visionClient: ImageAnnotatorClient | null = null;
  private ocrAvailable = false;
  private browser: Browser | null = null;
  private readonly tempDir = '/tmp/document-parser';
  private llm?: ILLMPort;

  constructor(visionKeyPath: string, llm?: ILLMPort) {
    this.llm = llm;
    try {
      if (fsSync.existsSync(visionKeyPath)) {
        this.visionClient = new ImageAnnotatorClient({
          keyFilename: visionKeyPath,
        });
        this.ocrAvailable = true;
        logger.info('Vision OCR enabled', { keyPath: visionKeyPath });
      } else {
        logger.warn('Vision OCR credentials not found, OCR disabled', { keyPath: visionKeyPath });
      }
    } catch (err: any) {
      logger.warn('Vision OCR initialization failed, OCR disabled', { error: err.message });
    }
  }

  async initialize(): Promise<void> {
    // Ensure temp directory exists
    await fs.mkdir(this.tempDir, { recursive: true });
    logger.info('DocumentParser initialized', { tempDir: this.tempDir, ocrAvailable: this.ocrAvailable });
  }

  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
      logger.info('Playwright browser launched');
    }
    return this.browser;
  }

  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      logger.info('Playwright browser closed');
    }
  }

  /**
   * Parse PDF document using Playwright + pdf.js rendering + Google Vision OCR.
   * Renders each page to a canvas in a headless browser, screenshots it, and OCRs the image.
   */
  async parsePDF(fileBuffer: Buffer): Promise<ParsedDocument> {
    if (!this.ocrAvailable) {
      throw new Error('PDF parsing requires OCR — Vision credentials not configured');
    }

    try {
      return await this.parsePDFWithPlaywright(fileBuffer);
    } catch (error: any) {
      logger.error('PDF parsing failed', { error: error.message });
      throw new Error(`Failed to parse PDF: ${error.message}`);
    }
  }

  /**
   * Render PDF pages to canvas via Playwright + pdf.js, then OCR each page screenshot.
   * Uses context.route() to serve pdfjs-dist files from node_modules over virtual HTTP.
   */
  private async parsePDFWithPlaywright(fileBuffer: Buffer): Promise<ParsedDocument> {
    const MAX_PAGES = 10;
    const SCALE = 2.0;
    const pdfBuildDir = findPdfJsBuildDir();
    const browser = await this.getBrowser();
    const context = await browser.newContext();

    try {
      // Serve pdf.js files via route interception (avoids file:// CORS issues with ESM workers)
      await context.route('http://pdfrender/**', async (route) => {
        const url = new URL(route.request().url());
        // hostname is 'pdfrender', pathname is '/render.html' or '/pdf.min.mjs' etc.
        const filePath = url.pathname.slice(1);

        if (filePath === 'render.html') {
          await route.fulfill({
            contentType: 'text/html',
            body: `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body><div id="container"></div>
<script type="module">
import { getDocument, GlobalWorkerOptions } from './pdf.min.mjs';
GlobalWorkerOptions.workerSrc = './pdf.worker.min.mjs';

window.renderPDF = async function(base64Data, maxPages, scale) {
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

  const pdf = await getDocument({ data: bytes }).promise;
  const totalPages = pdf.numPages;
  const pagesToRender = Math.min(totalPages, maxPages);
  const container = document.getElementById('container');
  container.innerHTML = '';

  for (let i = 1; i <= pagesToRender; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.id = 'page-' + i;
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    container.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
  }

  return { totalPages, renderedPages: pagesToRender };
};
</script></body></html>`,
          });
          return;
        }

        // Serve pdf.js build files from node_modules
        const localPath = path.join(pdfBuildDir, filePath);
        if (fsSync.existsSync(localPath)) {
          const content = await fs.readFile(localPath);
          const ext = path.extname(filePath);
          const contentType = ext === '.mjs' ? 'application/javascript' : 'application/octet-stream';
          await route.fulfill({ contentType, body: content });
        } else {
          await route.fulfill({ status: 404, body: 'Not found' });
        }
      });

      const page = await context.newPage();

      // Log browser console and errors for debugging
      page.on('console', msg => logger.debug('Browser console', { type: msg.type(), text: msg.text() }));
      page.on('pageerror', err => logger.error('Browser page error', { error: err.message }));

      await page.goto('http://pdfrender/render.html', { waitUntil: 'load' });

      // Wait for the ESM module to finish loading and define renderPDF
      await page.waitForFunction(() => typeof (globalThis as any).renderPDF === 'function', null, { timeout: 15000 });

      // Pass PDF data to the browser and render pages
      const base64Data = fileBuffer.toString('base64');
      const renderResult = await page.evaluate(
        async ([data, maxPages, scale]) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return await (globalThis as any).renderPDF(data, maxPages, scale);
        },
        [base64Data, MAX_PAGES, SCALE] as const
      );

      const totalPages = renderResult.totalPages as number;
      const renderedPages = renderResult.renderedPages as number;

      logger.info('PDF rendered via Playwright + pdf.js', { totalPages, renderedPages });

      const pages: Array<{ pageNumber: number; text: string; confidence?: number }> = [];
      let fullText = '';

      // Screenshot each canvas and OCR it
      for (let i = 1; i <= renderedPages; i++) {
        const canvas = await page.$(`#page-${i}`);
        if (!canvas) {
          logger.warn(`Canvas for page ${i} not found, skipping`);
          continue;
        }

        logger.info(`OCR-ing PDF page ${i}/${renderedPages}`);
        const screenshot = await canvas.screenshot({ type: 'png' });
        const ocrResult = await this.performOCR(screenshot);

        pages.push({
          pageNumber: i,
          text: ocrResult.text,
          confidence: ocrResult.confidence,
        });

        fullText += ocrResult.text + '\n\n';
      }

      await page.close();

      return {
        text: fullText.trim(),
        metadata: {
          pageCount: totalPages,
          source: 'ocr' as const,
          mimeType: 'application/pdf',
        },
        pages,
      };
    } finally {
      await context.close();
    }
  }

  /**
   * Parse DOCX document
   * Strategy: Try mammoth first, fallback to OCR
   */
  async parseDOCX(fileBuffer: Buffer): Promise<ParsedDocument> {
    try {
      // Strategy 1: Try native DOCX parsing with mammoth
      logger.info('Attempting native DOCX parsing with mammoth');
      const result = await mammoth.extractRawText({ buffer: fileBuffer });

      if (result.value && result.value.trim().length > 50) {
        logger.info('DOCX parsed successfully with mammoth', {
          textLength: result.value.length,
          messages: result.messages.length,
        });

        return {
          text: result.value,
          metadata: {
            source: 'native',
            mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
        };
      }

      // Strategy 2: Fallback to OCR if available
      if (this.ocrAvailable) {
        logger.warn('DOCX has no extractable text, falling back to OCR');
        return await this.parseDOCXWithOCR(fileBuffer);
      }

      logger.warn('DOCX has no extractable text and OCR not available');
      return {
        text: result.value || '[DOCX could not be parsed — no text and OCR not configured]',
        metadata: { source: 'native', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      };
    } catch (error: any) {
      logger.error('DOCX parsing failed', { error: error.message });
      throw new Error(`Failed to parse DOCX: ${error.message}`);
    }
  }

  /**
   * Parse legacy .doc (OLE Compound Document) using word-extractor
   */
  async parseDOC(fileBuffer: Buffer): Promise<ParsedDocument> {
    // Strategy 1: Try word-extractor for genuine OLE .doc files
    try {
      logger.info('Attempting legacy .doc parsing with word-extractor');
      const extractor = new WordExtractor();
      const doc = await extractor.extract(fileBuffer);
      const text = doc.getBody()?.trim() || '';

      if (text.length > 50) {
        logger.info('.doc parsed successfully with word-extractor', { textLength: text.length });
        return {
          text,
          metadata: {
            source: 'native',
            mimeType: 'application/msword',
          },
        };
      }
    } catch (error: any) {
      logger.warn('.doc word-extractor failed, trying DOCX fallback', { error: error.message });
    }

    // Strategy 2: Try parsing as DOCX (file may be mislabeled)
    try {
      const result = await this.parseDOCX(fileBuffer);
      logger.info('.doc parsed successfully as DOCX (mislabeled file)');
      return result;
    } catch (error: any) {
      logger.warn('.doc DOCX fallback also failed', { error: error.message });
    }

    // Strategy 3: Fallback to OCR if available
    if (this.ocrAvailable) {
      logger.warn('.doc has no extractable text, falling back to OCR');
      return await this.parseDOCXWithOCR(fileBuffer);
    }

    throw new Error('Failed to parse DOC: file could not be read as .doc or .docx, and OCR is not available');
  }

  /**
   * Parse DOCX using OCR (screenshot → Vision API)
   */
  private async parseDOCXWithOCR(fileBuffer: Buffer): Promise<ParsedDocument> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Save DOCX temporarily
      const tempDocxPath = path.join(this.tempDir, `${uuidv4()}.docx`);
      await fs.writeFile(tempDocxPath, fileBuffer);

      // Convert to HTML first using mammoth
      const htmlResult = await mammoth.convertToHtml({ buffer: fileBuffer });
      const tempHtmlPath = path.join(this.tempDir, `${uuidv4()}.html`);
      await fs.writeFile(tempHtmlPath, htmlResult.value);

      // Open HTML in browser
      await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle' });

      // Screenshot and OCR
      const screenshot = await page.screenshot({ fullPage: true });
      const ocrResult = await this.performOCR(screenshot);

      await page.close();
      await fs.unlink(tempDocxPath).catch(() => {});
      await fs.unlink(tempHtmlPath).catch(() => {});

      return {
        text: ocrResult.text,
        metadata: {
          source: 'ocr',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        },
        pages: [
          {
            pageNumber: 1,
            text: ocrResult.text,
            confidence: ocrResult.confidence,
          },
        ],
      };
    } catch (error: any) {
      await page.close();
      throw error;
    }
  }

  /**
   * Parse HTML document
   * Strategy: Extract text from DOM using Playwright (better than OCR for HTML)
   */
  async parseHTML(html: string | Buffer): Promise<ParsedDocument> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Auto-detect encoding or assume UTF-8
      let htmlContent: string;
      if (typeof html === 'string') {
        htmlContent = html;
      } else {
        // Try UTF-8 first, then Windows-1251 if UTF-8 fails
        try {
          htmlContent = html.toString('utf-8');
        } catch {
          // Fallback to latin1 which can decode any byte sequence
          htmlContent = html.toString('latin1');
        }
      }

      // Save HTML temporarily (use binary to preserve original encoding)
      const tempHtmlPath = path.join(this.tempDir, `${uuidv4()}.html`);
      await fs.writeFile(tempHtmlPath, html);

      logger.info('Parsing HTML by extracting text from DOM');

      await page.goto(`file://${tempHtmlPath}`, { waitUntil: 'networkidle' });

      // Extract text directly from DOM (much better than OCR for HTML)
      const text = await page.evaluate(() => {
        // @ts-ignore - browser context
        const scripts = document.querySelectorAll('script, style');
        // @ts-ignore
        scripts.forEach((el: any) => el.remove());

        // @ts-ignore - browser context
        return document.body?.innerText || document.body?.textContent || '';
      });

      await page.close();
      await fs.unlink(tempHtmlPath).catch(() => {});

      logger.info('HTML parsing completed', { textLength: text.length });

      return {
        text: text,
        metadata: {
          source: 'native',
          mimeType: 'text/html',
        },
        pages: [
          {
            pageNumber: 1,
            text: text,
          },
        ],
      };
    } catch (error: any) {
      await page.close();
      throw error;
    }
  }

  /**
   * Perform OCR using Google Vision API
   */
  private async performOCR(imageBuffer: Buffer): Promise<{ text: string; confidence: number }> {
    if (!this.visionClient || !this.ocrAvailable) {
      throw new Error('OCR not available — Vision credentials not configured');
    }

    try {
      logger.info('Performing OCR with Google Vision API', {
        imageSize: imageBuffer.length,
      });

      const [result] = await this.visionClient.documentTextDetection({
        image: { content: imageBuffer },
        imageContext: {
          languageHints: ['uk', 'ru', 'en'], // Ukrainian, Russian, English
        },
      });

      const fullTextAnnotation = result.fullTextAnnotation;

      if (!fullTextAnnotation || !fullTextAnnotation.text) {
        logger.warn('No text detected by Vision API');
        return { text: '', confidence: 0 };
      }

      // Calculate average confidence from pages
      const pages = fullTextAnnotation.pages || [];
      let totalConfidence = 0;
      let confidenceCount = 0;

      pages.forEach((page: any) => {
        page.blocks?.forEach((block: any) => {
          if (block.confidence !== undefined && block.confidence !== null) {
            totalConfidence += block.confidence;
            confidenceCount++;
          }
        });
      });

      const averageConfidence = confidenceCount > 0 ? totalConfidence / confidenceCount : 0;

      logger.info('OCR completed', {
        textLength: fullTextAnnotation.text.length,
        confidence: averageConfidence,
      });

      return {
        text: fullTextAnnotation.text,
        confidence: averageConfidence,
      };
    } catch (error: any) {
      logger.error('OCR failed', { error: error.message });
      throw new Error(`OCR failed: ${error.message}`);
    }
  }

  /**
   * Parse plain text document with encoding detection
   */
  async parsePlainText(fileBuffer: Buffer): Promise<ParsedDocument> {
    logger.info('Parsing plain text document', { size: fileBuffer.length });

    let text: string;

    // Check for BOM (Byte Order Mark)
    if (fileBuffer[0] === 0xEF && fileBuffer[1] === 0xBB && fileBuffer[2] === 0xBF) {
      // UTF-8 BOM
      text = fileBuffer.slice(3).toString('utf-8');
    } else if (fileBuffer[0] === 0xFF && fileBuffer[1] === 0xFE) {
      // UTF-16 LE BOM
      text = fileBuffer.slice(2).toString('utf16le');
    } else {
      // Try UTF-8, check for replacement characters that indicate wrong encoding
      text = fileBuffer.toString('utf-8');
      const replacementCount = (text.match(/\uFFFD/g) || []).length;
      if (replacementCount > text.length * 0.05) {
        // Too many replacement chars — likely Windows-1251 (common for Ukrainian docs)
        try {
          const decoder = new TextDecoder('windows-1251');
          text = decoder.decode(fileBuffer);
        } catch {
          // Keep UTF-8 result
        }
      }
    }

    if (!text.trim()) {
      throw new Error('Plain text file is empty');
    }

    logger.info('Plain text parsed', { textLength: text.length });

    return {
      text,
      metadata: {
        source: 'native',
        mimeType: 'text/plain',
      },
    };
  }

  /**
   * Parse RTF document by stripping control codes
   */
  async parseRTF(fileBuffer: Buffer): Promise<ParsedDocument> {
    logger.info('Parsing RTF document', { size: fileBuffer.length });

    const raw = fileBuffer.toString('latin1');

    // Strip RTF control sequences to extract plain text
    let text = raw;

    // Remove RTF header/groups (limit match to avoid ReDoS)
    text = text.replace(/\{\\rtf[^}]{0,500}\}/g, '');
    // Remove font tables, color tables, stylesheet, info groups
    text = text.replace(/\{\\fonttbl[^}]*\}/g, '');
    text = text.replace(/\{\\colortbl[^}]*\}/g, '');
    text = text.replace(/\{\\stylesheet[^}]*\}/g, '');
    text = text.replace(/\{\\info[^}]*\}/g, '');
    text = text.replace(/\{\\\*\\[^}]*\}/g, '');
    // Replace paragraph and line breaks
    text = text.replace(/\\par\b/g, '\n');
    text = text.replace(/\\line\b/g, '\n');
    text = text.replace(/\\tab\b/g, '\t');
    // Remove remaining control words
    text = text.replace(/\\[a-z]+(-?\d+)?\s?/gi, '');
    // Remove braces
    text = text.replace(/[{}]/g, '');
    // Decode Unicode escapes \'XX (hex byte — typically Windows-1251 for Ukrainian)
    text = text.replace(/\\'([0-9a-fA-F]{2})/g, (_, hex) => {
      const byte = parseInt(hex, 16);
      // Decode as Windows-1251 for values above 127
      if (byte > 127) {
        try {
          const decoder = new TextDecoder('windows-1251');
          return decoder.decode(new Uint8Array([byte]));
        } catch {
          return String.fromCharCode(byte);
        }
      }
      return String.fromCharCode(byte);
    });
    // Decode Unicode escapes \uNNNN
    text = text.replace(/\\u(\d+)\??/g, (_, code) => String.fromCharCode(parseInt(code, 10)));
    // Clean up whitespace
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

    if (!text.trim()) {
      throw new Error('RTF file contains no extractable text');
    }

    logger.info('RTF parsed', { textLength: text.length });

    return {
      text,
      metadata: {
        source: 'native',
        mimeType: 'application/rtf',
      },
    };
  }

  /**
   * Parse image files using OCR (Google Vision API)
   */
  async parseImage(fileBuffer: Buffer, mimeType: string): Promise<ParsedDocument> {
    logger.info('Parsing image via OCR', { mimeType, size: fileBuffer.length });

    if (!this.ocrAvailable) {
      throw new Error('OCR not available — Vision credentials not configured. Cannot extract text from images.');
    }

    const ocrResult = await this.performOCR(fileBuffer);

    if (!ocrResult.text.trim()) {
      throw new Error('No text detected in image via OCR');
    }

    logger.info('Image OCR completed', { textLength: ocrResult.text.length, confidence: ocrResult.confidence });

    return {
      text: ocrResult.text,
      metadata: {
        source: 'ocr',
        mimeType,
      },
      pages: [{
        pageNumber: 1,
        text: ocrResult.text,
        confidence: ocrResult.confidence,
      }],
    };
  }

  /**
   * Parse XLSX/XLS spreadsheets using ExcelJS
   */
  async parseXLSX(fileBuffer: Buffer, mimeType: string): Promise<ParsedDocument> {
    logger.info('Parsing spreadsheet', { mimeType, size: fileBuffer.length });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(fileBuffer as any);
    const textParts: string[] = [];

    workbook.eachSheet((sheet) => {
      textParts.push(`--- ${sheet.name} ---`);

      sheet.eachRow((row) => {
        const values = row.values as any[];
        // ExcelJS row.values is 1-indexed (index 0 is undefined)
        const line = values.slice(1).map((cell: any) => {
          if (cell == null) return '';
          if (typeof cell === 'object' && cell.text) return cell.text;
          if (typeof cell === 'object' && cell.result != null) return String(cell.result);
          return String(cell);
        }).join('\t');
        if (line.trim()) {
          textParts.push(line);
        }
      });

      textParts.push(''); // blank line between sheets
    });

    const text = textParts.join('\n').trim();

    if (!text) {
      throw new Error('Spreadsheet contains no extractable text');
    }

    logger.info('Spreadsheet parsed', { textLength: text.length, sheetCount: workbook.worksheets.length });

    return {
      text,
      metadata: {
        source: 'native',
        mimeType,
      },
    };
  }

  /**
   * Parse ODT (OpenDocument Text) by extracting content.xml from the ZIP archive
   */
  async parseODT(fileBuffer: Buffer): Promise<ParsedDocument> {
    logger.info('Parsing ODT document', { size: fileBuffer.length });

    const zip = new AdmZip(fileBuffer);
    const contentEntry = zip.getEntry('content.xml');

    if (!contentEntry) {
      throw new Error('ODT file does not contain content.xml');
    }

    const contentXml = contentEntry.getData().toString('utf-8');

    // Use cheerio to extract plain text from ODT content.xml
    const $odt = cheerioLoad(contentXml, { xml: true });
    const text = $odt.root().text().replace(/\s+/g, ' ').trim();

    if (!text) {
      throw new Error('ODT file contains no extractable text');
    }

    logger.info('ODT parsed', { textLength: text.length });

    return {
      text,
      metadata: {
        source: 'native',
        mimeType: 'application/vnd.oasis.opendocument.text',
      },
    };
  }

  /**
   * Parse ODS (OpenDocument Spreadsheet) by extracting table cells from content.xml
   */
  async parseODS(fileBuffer: Buffer): Promise<ParsedDocument> {
    logger.info('Parsing ODS spreadsheet', { size: fileBuffer.length });

    const zip = new AdmZip(fileBuffer);
    const contentEntry = zip.getEntry('content.xml');

    if (!contentEntry) {
      throw new Error('ODS file does not contain content.xml');
    }

    const contentXml = contentEntry.getData().toString('utf-8');

    // Extract text from table cells: <text:p> inside <table:table-cell>
    // Simple regex approach — sufficient for text extraction
    const rows: string[] = [];
    const tableMatches = contentXml.match(/<table:table-row[^>]*>[\s\S]*?<\/table:table-row>/g) || [];

    for (const rowXml of tableMatches) {
      const cellTexts: string[] = [];
      const cellMatches = rowXml.match(/<table:table-cell[^>]*>[\s\S]*?<\/table:table-cell>/g) || [];

      for (const cellXml of cellMatches) {
        // Extract text content from <text:p> elements
        const textMatches = cellXml.match(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g) || [];
        const cellText = textMatches
          .map(m => cheerioLoad(m, { xml: true }).root().text().trim())
          .join(' ');

        // Handle repeated empty cells
        const repeatMatch = cellXml.match(/table:number-columns-repeated="(\d+)"/);
        if (repeatMatch && !cellText) {
          const count = Math.min(parseInt(repeatMatch[1], 10), 20); // cap to avoid huge empty runs
          for (let i = 0; i < count; i++) cellTexts.push('');
        } else {
          cellTexts.push(cellText);
        }
      }

      const line = cellTexts.join('\t').trim();
      if (line) {
        rows.push(line);
      }
    }

    const text = rows.join('\n').trim();

    if (!text) {
      throw new Error('ODS spreadsheet contains no extractable text');
    }

    logger.info('ODS parsed', { textLength: text.length, rowCount: rows.length });

    return {
      text,
      metadata: {
        source: 'native',
        mimeType: 'application/vnd.oasis.opendocument.spreadsheet',
      },
    };
  }

  /**
   * Decode RFC 2047 encoded words (=?charset?encoding?text?=)
   */
  private decodeEncodedWords(str: string): string {
    return str.replace(/=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g, (_match, charset, encoding, text) => {
      const enc = (charset || 'utf-8').toLowerCase().replace(/^(utf8|utf-8)$/, 'utf-8');
      if (encoding.toUpperCase() === 'B') {
        try { return Buffer.from(text, 'base64').toString(enc as BufferEncoding); } catch { return text; }
      }
      if (encoding.toUpperCase() === 'Q') {
        // Collect all bytes first, then decode as charset (handles multi-byte UTF-8)
        const withSpaces = text.replace(/_/g, ' ');
        const bytes: number[] = [];
        let i = 0;
        while (i < withSpaces.length) {
          if (withSpaces[i] === '=' && i + 2 < withSpaces.length) {
            bytes.push(parseInt(withSpaces.substring(i + 1, i + 3), 16));
            i += 3;
          } else {
            bytes.push(withSpaces.charCodeAt(i));
            i++;
          }
        }
        try { return Buffer.from(bytes).toString(enc as BufferEncoding); } catch { return text; }
      }
      return text;
    });
  }

  /**
   * Extract a header value, handling multi-line folded headers
   */
  private extractEmlHeader(headers: string, name: string): string {
    const regex = new RegExp(`^${name}:\\s*(.+(?:\\r?\\n[ \\t].+)*)`, 'mi');
    const match = headers.match(regex);
    if (!match) return '';
    const raw = match[1].replace(/\r?\n[ \t]+/g, ' ').trim();
    return this.decodeEncodedWords(raw);
  }

  /**
   * Parse EML (email message) — properly handles multipart MIME
   */
  async parseEML(fileBuffer: Buffer): Promise<ParsedDocument> {
    logger.info('Parsing EML message', { size: fileBuffer.length });

    const raw = fileBuffer.toString('utf-8');

    // Split headers from body at first blank line
    const splitMatch = raw.match(/\r?\n\r?\n/);
    if (!splitMatch || splitMatch.index === undefined) {
      throw new Error('EML file contains no extractable text');
    }

    const headers = raw.substring(0, splitMatch.index);
    const bodySection = raw.substring(splitMatch.index + splitMatch[0].length);

    // Extract headers
    const subject = this.extractEmlHeader(headers, 'Subject');
    const from = this.extractEmlHeader(headers, 'From');
    const date = this.extractEmlHeader(headers, 'Date');
    const to = this.extractEmlHeader(headers, 'To');

    const contentType = this.extractEmlHeader(headers, 'Content-Type');
    const transferEncoding = this.extractEmlHeader(headers, 'Content-Transfer-Encoding').toLowerCase();

    let textBody = '';
    let htmlBody = '';
    const attachmentNames: string[] = [];
    const attachmentBuffers: EmlAttachment[] = [];

    if (contentType.toLowerCase().includes('multipart')) {
      // Extract boundary
      const boundaryMatch = contentType.match(/boundary="?([^";\s]+)"?/i) ||
                            headers.match(/boundary="?([^";\s]+)"?/i);
      if (boundaryMatch) {
        this.extractMimeParts(bodySection, boundaryMatch[1], (ct, content) => {
          if (ct.startsWith('text/plain') && !textBody) textBody = content;
          else if (ct.startsWith('text/html') && !htmlBody) htmlBody = content;
        }, attachmentNames, attachmentBuffers);
      }
    } else if (contentType.toLowerCase().includes('text/html')) {
      htmlBody = this.decodeMimeContent(bodySection, transferEncoding);
    } else {
      textBody = this.decodeMimeContent(bodySection, transferEncoding);
    }

    // Build readable output
    const lines: string[] = [];
    if (subject) lines.push(`Subject: ${subject}`);
    if (from) lines.push(`From: ${from}`);
    if (to) lines.push(`To: ${to}`);
    if (date) lines.push(`Date: ${date}`);
    if (lines.length > 0) lines.push('');

    // Prefer plain text, fall back to stripped HTML
    let body = textBody.trim();
    if (!body && htmlBody) {
      const $email = cheerioLoad(htmlBody);
      $email('script, style').remove();
      body = ($email('body').text() || $email.root().text()).replace(/\s+/g, ' ').trim();
    }
    if (body) lines.push(body);

    if (attachmentNames.length > 0) {
      lines.push('', `Attachments (${attachmentNames.length}):`);
      for (const att of attachmentNames) lines.push(`- ${att}`);
    }

    const text = lines.join('\n');
    if (!text.trim()) {
      throw new Error('EML file contains no extractable text');
    }

    logger.info('EML parsed', { textLength: text.length, attachments: attachmentNames.length, attachmentBuffers: attachmentBuffers.length });

    return {
      text,
      metadata: {
        source: 'native',
        mimeType: 'message/rfc822',
        title: subject || undefined,
      },
      ...(attachmentBuffers.length > 0 ? { attachments: attachmentBuffers } : {}),
    };
  }

  /**
   * Recursively extract text parts and binary attachments from multipart MIME
   */
  private extractMimeParts(
    body: string,
    boundary: string,
    onText: (contentType: string, content: string) => void,
    attachmentNames: string[],
    attachmentBuffers?: EmlAttachment[]
  ): void {
    const escaped = boundary.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const parts = body.split(new RegExp(`--${escaped}(?:--)?`));

    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;

      const partSplit = trimmed.match(/\r?\n\r?\n/);
      if (!partSplit || partSplit.index === undefined) continue;

      const partHeaders = trimmed.substring(0, partSplit.index);
      const partBody = trimmed.substring(partSplit.index + partSplit[0].length);

      const ctMatch = partHeaders.match(/Content-Type:\s*([^;\r\n]+)/i);
      const ct = ctMatch ? ctMatch[1].trim().toLowerCase() : 'text/plain';

      // Handle nested multipart
      if (ct.startsWith('multipart/')) {
        const nestedBoundary = partHeaders.match(/boundary="?([^";\s]+)"?/i);
        if (nestedBoundary) {
          this.extractMimeParts(partBody, nestedBoundary[1], onText, attachmentNames, attachmentBuffers);
        }
        continue;
      }

      const encMatch = partHeaders.match(/Content-Transfer-Encoding:\s*(\S+)/i);
      const enc = encMatch ? encMatch[1].trim().toLowerCase() : '7bit';

      // Check for explicit attachments
      const isAttachment = /Content-Disposition:\s*attachment/i.test(partHeaders);
      // Check for inline with Content-ID (embedded images)
      const isInline = /Content-Disposition:\s*inline/i.test(partHeaders) && /Content-ID:/i.test(partHeaders);

      if (isAttachment || (isInline && !ct.startsWith('text/'))) {
        const nameMatch = partHeaders.match(/filename="?([^";\r\n]+)"?/i) ||
                          partHeaders.match(/name="?([^";\r\n]+)"?/i);
        const filename = nameMatch ? this.decodeEncodedWords(nameMatch[1].trim()) : `attachment-${attachmentNames.length + 1}`;
        attachmentNames.push(filename);

        // Decode binary data if collecting attachments
        if (attachmentBuffers) {
          try {
            let data: Buffer;
            if (enc === 'base64') {
              data = Buffer.from(partBody.replace(/\s/g, ''), 'base64');
            } else if (enc === 'quoted-printable') {
              const stripped = partBody.replace(/=\r?\n/g, '');
              const maxLen = Math.min(stripped.length, 50 * 1024 * 1024); // 50MB safety cap
              const bytes: number[] = [];
              let i = 0;
              while (i < maxLen) {
                if (stripped[i] === '=' && i + 2 < maxLen && /[0-9A-Fa-f]{2}/.test(stripped.substring(i + 1, i + 3))) {
                  bytes.push(parseInt(stripped.substring(i + 1, i + 3), 16));
                  i += 3;
                } else {
                  bytes.push(stripped.charCodeAt(i));
                  i++;
                }
              }
              data = Buffer.from(bytes);
            } else {
              data = Buffer.from(partBody, 'binary');
            }

            if (data.length > 0) {
              attachmentBuffers.push({ filename, mimeType: ct, data });
            }
          } catch (err: any) {
            logger.warn('Failed to decode EML attachment', { filename, encoding: enc, error: err.message });
          }
        }
        continue;
      }

      if (ct.startsWith('text/')) {
        onText(ct, this.decodeMimeContent(partBody, enc));
      }
    }
  }

  /**
   * Decode MIME content based on transfer encoding
   */
  private decodeMimeContent(content: string, encoding: string): string {
    if (encoding === 'base64') {
      try {
        return Buffer.from(content.replace(/\s/g, ''), 'base64').toString('utf-8');
      } catch { return content; }
    }
    if (encoding === 'quoted-printable') {
      // Remove soft line breaks, then decode all =XX sequences as raw bytes → UTF-8
      const stripped = content.replace(/=\r?\n/g, '');
      const maxLen = Math.min(stripped.length, 50 * 1024 * 1024); // 50MB safety cap
      const bytes: number[] = [];
      let i = 0;
      while (i < maxLen) {
        if (stripped[i] === '=' && i + 2 < maxLen && /[0-9A-Fa-f]{2}/.test(stripped.substring(i + 1, i + 3))) {
          bytes.push(parseInt(stripped.substring(i + 1, i + 3), 16));
          i += 3;
        } else {
          bytes.push(stripped.charCodeAt(i));
          i++;
        }
      }
      try { return Buffer.from(bytes).toString('utf-8'); } catch { return stripped; }
    }
    return content;
  }

  /**
   * Attempt to parse unknown format using LLM
   * Sends a sample of the file content to LLM for format identification and text extraction
   */
  async parseWithLLM(fileBuffer: Buffer, mimeType: string): Promise<ParsedDocument> {
    logger.info('Attempting LLM-based parsing for unknown format', { mimeType, size: fileBuffer.length });

    // Take a sample (first 2KB) to send to LLM
    const sampleSize = Math.min(fileBuffer.length, 2048);
    let sample: string;

    // Try to read as text
    try {
      sample = fileBuffer.slice(0, sampleSize).toString('utf-8');
    } catch {
      sample = fileBuffer.slice(0, sampleSize).toString('latin1');
    }

    // Check if it's mostly binary (non-printable characters)
    const printableRatio = sample.replace(/[^\x20-\x7E\xA0-\xFF\u0400-\u04FF\n\r\t]/g, '').length / sample.length;
    if (printableRatio < 0.3) {
      throw new Error(
        `File appears to be binary (${(printableRatio * 100).toFixed(0)}% printable). ` +
        `MIME type: ${mimeType}. Cannot extract text from binary files.`
      );
    }

    if (!this.llm) {
      throw new Error('LLM port not configured — cannot parse unknown format');
    }

    const response = await this.llm.chatCompletion({
      messages: [
        {
          role: 'system',
          content:
            'You are a document format analyst. Given a sample of file content, determine:\n' +
            '1. What format/type is this file?\n' +
            '2. Does it contain meaningful text data (legal docs, contracts, notes, etc.)?\n' +
            '3. If yes, extract the clean text content.\n\n' +
            'Respond in JSON format:\n' +
            '{"format": "description", "has_text": true/false, "text": "extracted text or empty", "reason": "why it does/doesnt have text"}',
        },
        {
          role: 'user',
          content:
            `MIME type: ${mimeType}\nFile size: ${fileBuffer.length} bytes\n\n` +
            `--- File content sample (first ${sampleSize} bytes) ---\n${sample}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 4096,
      response_format: { type: 'json_object' },
    }, 'quick');

    let result: { format: string; has_text: boolean; text: string; reason: string };
    try {
      result = JSON.parse(response.content);
    } catch {
      throw new Error(`LLM could not analyze file format: ${response.content.substring(0, 200)}`);
    }

    if (!result.has_text || !result.text?.trim()) {
      throw new Error(
        `File format "${result.format}" does not contain extractable text. ${result.reason || ''}`
      );
    }

    // If the sample was smaller than the file, extract full text
    let fullText = result.text;
    if (fileBuffer.length > sampleSize) {
      // For larger files, read entire content as text
      try {
        fullText = fileBuffer.toString('utf-8');
      } catch {
        fullText = fileBuffer.toString('latin1');
      }
      // Remove non-printable characters
      fullText = fullText.replace(/[^\x20-\x7E\xA0-\xFF\u0400-\u04FF\n\r\t]/g, '');
    }

    logger.info('LLM-based parsing completed', {
      format: result.format,
      textLength: fullText.length,
    });

    return {
      text: fullText,
      metadata: {
        source: 'native',
        mimeType,
      },
    };
  }

  /**
   * Auto-detect document type and parse
   */
  async parseDocument(fileBuffer: Buffer, mimeType?: string): Promise<ParsedDocument> {
    // Detect MIME type from buffer if not provided
    if (!mimeType) {
      mimeType = this.detectMimeType(fileBuffer);
    }

    logger.info('Parsing document', { mimeType, size: fileBuffer.length });

    switch (mimeType) {
      case 'application/pdf':
        return await this.parsePDF(fileBuffer);

      case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        return await this.parseDOCX(fileBuffer);

      case 'application/msword': {
        // Detect actual format by magic bytes: OLE = D0CF11E0, ZIP/DOCX = 504B0304
        const header = fileBuffer.slice(0, 4).toString('hex');
        if (header === '504b0304') {
          // Actually a .docx with wrong MIME type
          return await this.parseDOCX(fileBuffer);
        }
        return await this.parseDOC(fileBuffer);
      }

      case 'text/html':
        return await this.parseHTML(fileBuffer);

      case 'text/plain':
        return await this.parsePlainText(fileBuffer);

      case 'application/rtf':
        return await this.parseRTF(fileBuffer);

      // Image types → OCR
      case 'image/jpeg':
      case 'image/png':
      case 'image/tiff':
      case 'image/webp':
      case 'image/bmp':
        return await this.parseImage(fileBuffer, mimeType);

      // Spreadsheets
      case 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
      case 'application/vnd.ms-excel':
        return await this.parseXLSX(fileBuffer, mimeType);

      // OpenDocument formats
      case 'application/vnd.oasis.opendocument.text':
        return await this.parseODT(fileBuffer);

      case 'application/vnd.oasis.opendocument.spreadsheet':
        return await this.parseODS(fileBuffer);

      // CSV is just text
      case 'text/csv':
        return await this.parsePlainText(fileBuffer);

      // Email messages
      case 'message/rfc822':
        return await this.parseEML(fileBuffer);

      default:
        // Try LLM-based parsing for unknown formats
        logger.warn(`Unknown MIME type "${mimeType}", attempting LLM-based parsing`);
        return await this.parseWithLLM(fileBuffer, mimeType);
    }
  }

  /**
   * Detect MIME type from file buffer
   */
  private detectMimeType(buffer: Buffer): string {
    // Check magic bytes
    const header = buffer.slice(0, 8).toString('hex');

    // PDF: %PDF (25 50 44 46)
    if (header.startsWith('25504446')) {
      return 'application/pdf';
    }

    // DOCX: PK (ZIP format)
    if (header.startsWith('504b0304')) {
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    }

    // DOC: OLE Compound Document (D0 CF 11 E0)
    if (header.startsWith('d0cf11e0')) {
      return 'application/msword';
    }

    // RTF: {\rtf
    const textStart = buffer.slice(0, 200).toString('utf-8');
    if (textStart.startsWith('{\\rtf')) {
      return 'application/rtf';
    }

    // HTML: check for common HTML tags
    const textLower = textStart.toLowerCase();
    if (textLower.includes('<html') || textLower.includes('<!doctype html')) {
      return 'text/html';
    }

    // EML: check for email headers
    if (/^(From|Subject|Date|MIME-Version|Received|Return-Path):\s/mi.test(textStart) &&
        (/boundary=/i.test(textStart) || /^Subject:\s/mi.test(textStart) || /^Content-Type:\s*multipart/mi.test(textStart))) {
      return 'message/rfc822';
    }

    // Check if it looks like plain text (mostly printable characters)
    const sample = buffer.slice(0, Math.min(buffer.length, 512));
    const printable = sample.filter(
      (b) => (b >= 0x20 && b <= 0x7E) || b === 0x0A || b === 0x0D || b === 0x09 || b >= 0xC0
    ).length;
    if (printable / sample.length > 0.85) {
      return 'text/plain';
    }

    // Fall back to text/plain for unknown — parseWithLLM will handle in parseDocument
    return 'text/plain';
  }
}
