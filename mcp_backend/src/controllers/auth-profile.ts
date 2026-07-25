/**
 * Auth Profile — getCurrentUser, updateProfile, acceptAttorneyOffer,
 * getMyContracts, logout, refreshToken, uploadAvatar, getAvatar, getBanner, regenerateBanner
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { logger } from '../utils/logger.js';
import { getUserService } from '../middleware/dual-auth.js';
import {
  type AuthenticatedRequest,
  JWT_SECRET,
  JWT_EXPIRES_IN,
  AVATAR_BUCKET,
  AVATAR_MAX_SIZE,
  AVATAR_QUALITY,
  SUPPORTED_IMAGE_FORMATS,
  getAuthMinioService,
  getAuthBannerService,
} from './auth-common.js';

// ---------------------------------------------------------------------------
// Avatar helpers
// ---------------------------------------------------------------------------

async function ensureAvatarBucket(): Promise<void> {
  const authMinioService = getAuthMinioService();
  if (!authMinioService) throw new Error('MinIO service not configured');
  try {
    const client = (authMinioService as any).client;
    const exists = await client.bucketExists(AVATAR_BUCKET);
    if (!exists) {
      await client.makeBucket(AVATAR_BUCKET);
      const policy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${AVATAR_BUCKET}/*`],
        }],
      });
      await client.setBucketPolicy(AVATAR_BUCKET, policy);
      logger.info('[Avatar] Created avatars bucket with public read policy');
    }
  } catch (error: any) {
    logger.error('[Avatar] Failed to ensure avatars bucket:', error);
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------

/**
 * Get current user profile
 * Protected route - requires JWT authentication
 */
export async function getCurrentUser(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No user found in request',
      });
    }

    // Check attorney offer acceptance for attorney users
    let attorneyOfferAccepted = false;
    let attorneyContractNumber: string | null = null;
    let attorneyContractDate: string | null = null;
    if (user.user_type === 'attorney') {
      try {
        const userService = getUserService();
        const db = (userService as any).db;
        const result = await db.query(
          `SELECT contract_number, contract_date FROM eula_acceptances WHERE user_id = $1 AND eula_version = $2 LIMIT 1`,
          [user.id, 'attorney-offer-1.0']
        );
        attorneyOfferAccepted = result.rows.length > 0;
        if (result.rows.length > 0) {
          attorneyContractNumber = result.rows[0].contract_number;
          attorneyContractDate = result.rows[0].contract_date;
        }
      } catch (err: any) {
        logger.warn('Failed to check attorney offer acceptance', { userId: user.id, error: err.message });
      }
    }

    // Check developer offer acceptance
    let developerOfferAccepted = false;
    try {
      const userService = getUserService();
      const db = (userService as any).db;
      const devResult = await db.query(
        `SELECT 1 FROM eula_acceptances WHERE user_id = $1 AND eula_version = $2 LIMIT 1`,
        [user.id, 'developer-offer-1.0']
      );
      developerOfferAccepted = devResult.rows.length > 0;
    } catch (err: any) {
      logger.warn('Failed to check developer offer acceptance', { userId: user.id, error: err.message });
    }

    // Return user profile without sensitive data
    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        banner: user.banner || null,
        emailVerified: user.email_verified,
        lastLogin: user.last_login,
        createdAt: user.created_at,
        role: user.role,
        userType: user.user_type || 'individual',
        developerOfferAccepted,
        ...(user.user_type === 'attorney' && {
          attorneyOfferAccepted,
          ...(attorneyContractNumber && { attorneyContractNumber }),
          ...(attorneyContractDate && { attorneyContractDate }),
        }),
      },
    });
  } catch (error: any) {
    logger.error('Error getting current user:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/**
 * Accept attorney offer
 * Records attorney offer acceptance in eula_acceptances table
 */
export async function acceptAttorneyOffer(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (user.user_type !== 'attorney') {
      return res.status(403).json({ error: 'Тільки адвокати можуть прийняти цю оферту' });
    }

    const userService = getUserService();
    const db = (userService as any).db;

    // Check if already accepted
    const existing = await db.query(
      `SELECT contract_number, contract_date FROM eula_acceptances WHERE user_id = $1 AND eula_version = $2 LIMIT 1`,
      [user.id, 'attorney-offer-1.0']
    );

    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Оферту вже прийнято',
        contractNumber: existing.rows[0].contract_number,
        contractDate: existing.rows[0].contract_date,
      });
    }

    // Generate unique contract number: OFFER-YYYY-NNNN
    const year = new Date().getFullYear();
    const seqResult = await db.query(`SELECT nextval('attorney_offer_contract_seq') AS seq`);
    const seq = String(seqResult.rows[0].seq).padStart(4, '0');
    const contractNumber = `OFFER-${year}-${seq}`;
    const contractDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    await db.query(
      `INSERT INTO eula_acceptances (user_id, eula_version, ip_address, user_agent, contract_number, contract_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.id,
        'attorney-offer-1.0',
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown',
        contractNumber,
        contractDate,
      ]
    );

    logger.info('Attorney accepted offer', { userId: user.id, email: user.email, contractNumber });

    return res.json({ success: true, message: 'Оферту прийнято', contractNumber, contractDate });
  } catch (error: any) {
    logger.error('Error accepting attorney offer:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Accept developer public offer
 */
export async function acceptDeveloperOffer(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userService = getUserService();
    const db = (userService as any).db;

    const existing = await db.query(
      `SELECT contract_number, contract_date FROM eula_acceptances WHERE user_id = $1 AND eula_version = $2 LIMIT 1`,
      [user.id, 'developer-offer-1.0']
    );

    if (existing.rows.length > 0) {
      return res.json({
        success: true,
        message: 'Оферту вже прийнято',
        contractNumber: existing.rows[0].contract_number,
        contractDate: existing.rows[0].contract_date,
      });
    }

    const year = new Date().getFullYear();
    const seqResult = await db.query(
      `SELECT COALESCE(
        (SELECT nextval('developer_offer_contract_seq')),
        (SELECT MAX(CAST(SUBSTRING(contract_number FROM '\\d+$') AS INTEGER)) + 1 FROM eula_acceptances WHERE eula_version LIKE 'developer-%')
      ) AS seq`
    );
    const seq = String(seqResult.rows[0]?.seq || 1).padStart(4, '0');
    const contractNumber = `DEV-${year}-${seq}`;
    const contractDate = new Date().toISOString().split('T')[0];

    await db.query(
      `INSERT INTO eula_acceptances (user_id, eula_version, ip_address, user_agent, contract_number, contract_date)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        user.id,
        'developer-offer-1.0',
        req.ip || req.headers['x-forwarded-for'] || 'unknown',
        req.headers['user-agent'] || 'unknown',
        contractNumber,
        contractDate,
      ]
    );

    logger.info('Developer accepted offer', { userId: user.id, email: user.email, contractNumber });

    return res.json({ success: true, message: 'Оферту прийнято', contractNumber, contractDate });
  } catch (error: any) {
    logger.error('Error accepting developer offer:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Get all contracts/acceptances for current user
 */
export async function getMyContracts(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const userService = getUserService();
    const db = (userService as any).db;

    const result = await db.query(
      `SELECT id, eula_version, contract_number, contract_date, accepted_at, ip_address
       FROM eula_acceptances
       WHERE user_id = $1
       ORDER BY accepted_at DESC`,
      [user.id]
    );

    // Map eula_version to human-readable contract info
    const versionMap: Record<string, { title: string; type: string; url: string }> = {
      'attorney-offer-1.0': { title: 'Публічна оферта для адвокатів', type: 'attorney_offer', url: '/ua/attorney-offer' },
      'client-offer-1.0': { title: 'Публічна оферта для клієнтів', type: 'client_offer', url: '/ua/offer' },
      'marketplace-rules-1.0': { title: 'Правила маркетплейсу', type: 'marketplace_rules', url: '/ua/terms' },
      'developer-offer-1.0': { title: 'Оферта розробника', type: 'developer_offer', url: '/ua/developer-offer' },
    };

    const contracts = result.rows.map((row: any) => {
      const meta = versionMap[row.eula_version] || {
        title: row.eula_version,
        type: 'unknown',
        url: '#',
      };
      return {
        id: row.id,
        version: row.eula_version,
        contractNumber: row.contract_number || null,
        contractDate: row.contract_date || null,
        acceptedAt: row.accepted_at,
        ipAddress: row.ip_address || null,
        ...meta,
      };
    });

    return res.json({ contracts });
  } catch (error: any) {
    logger.error('Error getting user contracts:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Logout user
 */
export async function logout(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;

    if (user) {
      logger.info('User logged out', { userId: user.id, email: user.email });
    }

    return res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error: any) {
    logger.error('Error during logout:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/**
 * Refresh JWT token
 * Takes an existing valid token and issues a new one
 */
export async function refreshToken(req: Request, res: Response): Promise<Response> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No token provided',
      });
    }

    const token = authHeader.replace('Bearer ', '');

    // Verify existing token
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] }) as any;

    // Create new token with same payload but fresh expiry
    const newToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        googleId: decoded.googleId,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN, algorithm: 'HS256' }
    );

    logger.info('Token refreshed', { userId: decoded.userId });

    return res.json({
      token: newToken,
      expiresIn: JWT_EXPIRES_IN,
    });
  } catch (error: any) {
    logger.error('Error refreshing token:', error);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Token has expired. Please login again.',
      });
    }

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid token',
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/**
 * Update user profile
 * Protected route - requires JWT authentication
 */
export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'No user found in request',
      });
    }

    // Extract allowed update fields
    const { name, picture } = req.body;

    // Validate at least one field is provided
    if (name === undefined && picture === undefined) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'At least one field (name or picture) must be provided',
      });
    }

    // Validate name if provided
    if (name !== undefined) {
      if (typeof name !== 'string') {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Name must be a string',
        });
      }
      if (name.trim().length === 0) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Name cannot be empty',
        });
      }
      if (name.length > 255) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Name cannot exceed 255 characters',
        });
      }
    }

    // Validate picture if provided
    if (picture !== undefined) {
      if (typeof picture !== 'string' && picture !== null) {
        return res.status(400).json({
          error: 'Bad Request',
          message: 'Picture must be a string URL or null',
        });
      }
    }

    // Update user profile
    const userService = getUserService();
    const updates: { name?: string; picture?: string } = {};

    if (name !== undefined) {
      updates.name = name.trim();
    }
    if (picture !== undefined) {
      updates.picture = picture;
    }

    const updatedUser = await userService.updateProfile(user.id, updates);

    logger.info('User profile updated', {
      userId: user.id,
      email: user.email,
      updates,
    });

    // Return updated user profile
    return res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        picture: updatedUser.picture,
        emailVerified: updatedUser.email_verified,
        lastLogin: updatedUser.last_login,
        createdAt: updatedUser.created_at,
        updatedAt: updatedUser.updated_at,
      },
    });
  } catch (error: any) {
    logger.error('Error updating profile:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message,
    });
  }
}

/**
 * Upload user avatar
 */
export async function uploadAvatar(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const authMinioService = getAuthMinioService();
    if (!authMinioService) {
      return res.status(503).json({ error: 'Service Unavailable', message: 'Storage service not configured' });
    }

    const file = req.file;
    if (!file) {
      return res.status(400).json({ error: 'Bad Request', message: 'Файл не надано' });
    }

    if (!SUPPORTED_IMAGE_FORMATS.includes(file.mimetype)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: `Непідтримуваний формат. Підтримуються: JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIF, SVG, ICO`,
      });
    }

    // Process image with sharp: resize + convert to WebP
    let processedBuffer: Buffer;
    try {
      processedBuffer = await sharp(file.buffer)
        .resize(AVATAR_MAX_SIZE, AVATAR_MAX_SIZE, {
          fit: 'cover',
          position: 'center',
        })
        .webp({ quality: AVATAR_QUALITY })
        .toBuffer();
    } catch (imgError: any) {
      logger.error('[Avatar] Image processing failed:', imgError);
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Не вдалося обробити зображення. Перевірте формат файлу.',
      });
    }

    // Upload to MinIO
    await ensureAvatarBucket();
    const objectKey = `${user.id}.webp`;
    const client = (authMinioService as any).client;
    await client.putObject(AVATAR_BUCKET, objectKey, processedBuffer, processedBuffer.length, {
      'Content-Type': 'image/webp',
      'Cache-Control': 'public, max-age=86400',
    });

    // Store avatar path in DB
    const avatarPath = `/auth/avatar/${user.id}`;
    const userService = getUserService();
    const updatedUser = await userService.updateProfile(user.id, { picture: avatarPath });

    logger.info('[Avatar] Avatar uploaded', { userId: user.id, size: processedBuffer.length });

    return res.json({
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        name: updatedUser.name,
        picture: updatedUser.picture,
        emailVerified: updatedUser.email_verified,
        lastLogin: updatedUser.last_login,
        createdAt: updatedUser.created_at,
      },
    });
  } catch (error: any) {
    logger.error('[Avatar] Upload failed:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Serve user avatar from MinIO
 * Public endpoint - serves avatar by userId with caching headers
 */
export async function getAvatar(req: Request, res: Response): Promise<void> {
  try {
    const { userId } = req.params;
    if (!userId) {
      res.status(400).json({ error: 'Bad Request', message: 'User ID is required' });
      return;
    }

    const authMinioService = getAuthMinioService();
    if (!authMinioService) {
      res.status(503).json({ error: 'Service Unavailable' });
      return;
    }

    const objectKey = `${userId}.webp`;
    const client = (authMinioService as any).client;

    // Stream directly from MinIO
    const stream = await client.getObject(AVATAR_BUCKET, objectKey);

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    stream.pipe(res);
  } catch (error: any) {
    if (error.code === 'NoSuchKey' || error.code === 'NoSuchBucket') {
      res.status(404).json({ error: 'Not Found', message: 'Аватар не знайдено' });
    } else {
      logger.error('[Avatar] Serve failed:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

/**
 * Serve user banner from MinIO
 * Public endpoint - serves banner by userId with caching headers
 */
export async function getBanner(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.params.userId as string;
    if (!userId) {
      res.status(400).json({ error: 'Bad Request', message: 'User ID is required' });
      return;
    }

    const authBannerService = getAuthBannerService();
    if (!authBannerService) {
      res.status(503).json({ error: 'Service Unavailable' });
      return;
    }

    const stream = await authBannerService.getBannerStream(userId);
    if (!stream) {
      res.status(404).json({ error: 'Not Found', message: 'Банер не знайдено' });
      return;
    }

    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    stream.pipe(res);
  } catch (error: any) {
    logger.error('[Banner] Serve failed:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

/**
 * Regenerate banner for the current user
 * Protected route - requires JWT
 */
export async function regenerateBanner(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const authBannerService = getAuthBannerService();
    if (!authBannerService) {
      return res.status(503).json({ error: 'Service Unavailable', message: 'Banner service not configured' });
    }

    const bannerPath = await authBannerService.generateBanner(user.id, user.name || 'User');

    return res.json({
      success: true,
      banner: bannerPath,
    });
  } catch (error: any) {
    logger.error('[Banner] Regeneration failed:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}
