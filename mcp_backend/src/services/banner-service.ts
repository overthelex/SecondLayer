/**
 * Banner Service
 * Generates Ishihara-style color blindness test banners where the user's name
 * is hidden within colored dots.
 */

import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { MinioService } from './minio-service.js';
import type { IDatabase } from '../domain/ports/index.js';

const BANNER_WIDTH = 800;
const BANNER_HEIGHT = 200;
const BANNER_BUCKET = 'banners';
const BANNER_QUALITY = 85;

// Circle size range
const MIN_RADIUS = 4;
const MAX_RADIUS = 18;

// Color palettes for Ishihara effect
const BACKGROUND_COLORS = [
  '#2E8B57', '#3CB371', '#66CDAA', '#8FBC8F', '#20B2AA',
  '#2E9959', '#4CAF6E', '#5BB882', '#3DA06B', '#48B577',
  '#279E5E', '#55C285', '#6ECE9A', '#459F6E', '#38A863',
];

const TEXT_COLORS = [
  '#CD5C5C', '#E9967A', '#FA8072', '#F08080', '#DC143C',
  '#D96B6B', '#E8826E', '#F4907A', '#E07474', '#D45858',
  '#C94E4E', '#D77165', '#EB8B78', '#CE6262', '#DB6F5F',
];

/**
 * Simple seeded PRNG (mulberry32)
 */
function seededRandom(seed: number): () => number {
  return function () {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Hash a string to a numeric seed
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Check if a point falls within rendered text using a bitmap approach.
 * We render the text onto a small canvas via sharp and sample pixel values.
 */
async function createTextMask(name: string, width: number, height: number): Promise<boolean[][]> {
  const displayName = name.length > 20 ? name.substring(0, 20) : name;
  const fontSize = Math.min(72, Math.max(36, Math.floor(600 / Math.max(displayName.length, 1))));

  // Create SVG with just the text (white text on black background)
  const textSvg = `<svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${width}" height="${height}" fill="black"/>
    <text x="${width / 2}" y="${height / 2 + fontSize / 3}"
          font-family="Arial, Helvetica, sans-serif"
          font-size="${fontSize}" font-weight="bold"
          fill="white" text-anchor="middle">${escapeXml(displayName)}</text>
  </svg>`;

  // Render to raw pixels
  const { data, info } = await sharp(Buffer.from(textSvg))
    .raw()
    .toBuffer({ resolveWithObject: true });

  // Build 2D boolean mask (true = inside text)
  const mask: boolean[][] = [];
  for (let y = 0; y < info.height; y++) {
    mask[y] = [];
    for (let x = 0; x < info.width; x++) {
      const idx = (y * info.width + x) * info.channels;
      // White pixels (text) have high values
      mask[y][x] = data[idx] > 128;
    }
  }

  return mask;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate Ishihara-style SVG banner
 */
async function generateIshiharaSvg(userId: string, name: string): Promise<string> {
  const rand = seededRandom(hashString(userId));
  const textMask = await createTextMask(name, BANNER_WIDTH, BANNER_HEIGHT);

  const circles: string[] = [];

  // Generate packed circle positions
  const gridStep = 12; // spacing between circle center candidates
  for (let gy = MIN_RADIUS; gy < BANNER_HEIGHT - MIN_RADIUS; gy += gridStep) {
    for (let gx = MIN_RADIUS; gx < BANNER_WIDTH - MIN_RADIUS; gx += gridStep) {
      // Jitter position
      const x = gx + (rand() - 0.5) * gridStep * 0.8;
      const y = gy + (rand() - 0.5) * gridStep * 0.8;

      // Random radius
      const r = MIN_RADIUS + rand() * (MAX_RADIUS - MIN_RADIUS);

      // Check if center is inside text
      const mx = Math.round(Math.min(Math.max(x, 0), BANNER_WIDTH - 1));
      const my = Math.round(Math.min(Math.max(y, 0), BANNER_HEIGHT - 1));
      const isText = textMask[my]?.[mx] ?? false;

      // Pick color from appropriate palette
      const palette = isText ? TEXT_COLORS : BACKGROUND_COLORS;
      const color = palette[Math.floor(rand() * palette.length)];

      // Slight opacity variation for organic feel
      const opacity = 0.7 + rand() * 0.3;

      circles.push(
        `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}" opacity="${opacity.toFixed(2)}"/>`
      );
    }
  }

  return `<svg width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${BANNER_WIDTH}" height="${BANNER_HEIGHT}" fill="#1a1a2e"/>
  ${circles.join('\n  ')}
</svg>`;
}

export class BannerService {
  private minioService: MinioService;
  private db: IDatabase;

  constructor(minioService: MinioService, db: IDatabase) {
    this.minioService = minioService;
    this.db = db;
  }

  private async ensureBannerBucket(): Promise<void> {
    const client = (this.minioService as any).client;
    const exists = await client.bucketExists(BANNER_BUCKET);
    if (!exists) {
      await client.makeBucket(BANNER_BUCKET);
      const policy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${BANNER_BUCKET}/*`],
        }],
      });
      await client.setBucketPolicy(BANNER_BUCKET, policy);
      logger.info('[Banner] Created banners bucket with public read policy');
    }
  }

  /**
   * Generate an Ishihara-style banner for a user and store it in MinIO.
   * Returns the banner path.
   */
  async generateBanner(userId: string, name: string): Promise<string> {
    const displayName = name || 'User';

    // Generate SVG
    const svg = await generateIshiharaSvg(userId, displayName);

    // Convert SVG to WebP via sharp
    const webpBuffer = await sharp(Buffer.from(svg))
      .webp({ quality: BANNER_QUALITY })
      .toBuffer();

    // Upload to MinIO
    await this.ensureBannerBucket();
    const objectKey = `${userId}.webp`;
    const client = (this.minioService as any).client;
    await client.putObject(BANNER_BUCKET, objectKey, webpBuffer, webpBuffer.length, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400',
    });

    // Store path in DB
    const bannerPath = `/auth/banner/${userId}`;
    await this.db.query(
      'UPDATE users SET banner = $1 WHERE id = $2',
      [bannerPath, userId]
    );

    logger.info('[Banner] Generated banner', { userId, size: webpBuffer.length });
    return bannerPath;
  }

  /**
   * Serve banner from MinIO. Returns a readable stream or null if not found.
   */
  async getBannerStream(userId: string): Promise<NodeJS.ReadableStream | null> {
    try {
      const client = (this.minioService as any).client;
      return await client.getObject(BANNER_BUCKET, `${userId}.webp`);
    } catch (error: any) {
      if (error.code === 'NoSuchKey' || error.code === 'NoSuchBucket') {
        return null;
      }
      throw error;
    }
  }
}
