/**
 * Authentication Controller
 * Handles OAuth callbacks, JWT generation, and user sessions
 */

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import passport from 'passport';
import bcrypt from 'bcryptjs';
import sharp from 'sharp';
import crypto from 'crypto';
import { User } from '../services/user-service.js';
import { logger } from '../utils/logger.js';
import { getUserService, getWebAuthnService } from '../middleware/dual-auth.js';
import { EmailService } from '../services/email-service.js';
import { MinioService } from '../services/minio-service.js';
import { BannerService } from '../services/banner-service.js';
import type { ICachePort } from '../domain/ports/index.js';
import { getDiiaService } from '../services/diia-service.js';
import * as oidcService from '../services/oidc-service.js';
import { provisionAuthentikUser } from '../services/authentik-service.js';

let authCache: ICachePort | null = null;
let authEmailService: EmailService | null = null;
let authMinioService: MinioService | null = null;
let authBannerService: BannerService | null = null;

const AVATAR_BUCKET = 'avatars';
const AVATAR_MAX_SIZE = 512; // px
const AVATAR_QUALITY = 80;
const SUPPORTED_IMAGE_FORMATS = [
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'image/bmp', 'image/tiff', 'image/avif', 'image/heif', 'image/heic',
  'image/svg+xml', 'image/x-icon', 'image/vnd.microsoft.icon',
];

/** Set the cache port for WebAuthn challenge storage. Call from composition root. */
export function setAuthCache(cache: ICachePort): void {
  authCache = cache;
}

/** Set the email service for auth-related emails. Call from composition root. */
export function setAuthEmailService(svc: EmailService): void {
  authEmailService = svc;
}

/** Set the MinIO service for avatar storage. Call from composition root. */
export function setAuthMinioService(svc: MinioService): void {
  authMinioService = svc;
}

/** Set the banner service for profile banner generation. Call from composition root. */
export function setAuthBannerService(svc: BannerService): void {
  authBannerService = svc;
}

/**
 * Fire-and-forget banner generation for a new user.
 * Logs errors but never throws.
 */
function generateBannerAsync(userId: string, name: string): void {
  if (!authBannerService) return;
  authBannerService.generateBanner(userId, name).catch((err) => {
    logger.error('[Banner] Async generation failed', { userId, error: err.message });
  });
}

const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-in-production';
const JWT_EXPIRES_IN = '7d'; // 7 days
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

/**
 * Generate JWT token for user
 */
export function generateToken(user: User): string {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      googleId: user.google_id,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Initiate Google OAuth2 flow
 * Redirects user to Google login page
 */
export const googleOAuthInit = passport.authenticate('google', {
  scope: ['profile', 'email'],
  session: false,
});

/**
 * Google OAuth2 callback handler
 * Creates/links user account and returns JWT token
 */
export async function googleOAuthCallback(req: AuthenticatedRequest, res: Response) {
  try {
    // Determine frontend URL from request origin (supports multiple domains)
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const frontendUrl = `${protocol}://${host}`;

    // Passport will have attached user to req.user
    const user = req.user;

    if (!user) {
      // OAuth failed
      logger.error('OAuth callback failed - no user in request');
      return res.redirect(`${frontendUrl}/login?error=oauth_failed`);
    }

    // Generate JWT token for the user
    const token = generateToken(user);

    logger.info('Google OAuth successful', {
      userId: user.id,
      email: user.email,
    });

    // Redirect to frontend with token in URL
    const redirectUrl = `${frontendUrl}/login?token=${token}`;
    return res.redirect(redirectUrl);
  } catch (error: any) {
    logger.error('Error in OAuth callback:', error);
    return res.redirect(`${FRONTEND_URL}/login?error=server_error`);
  }
}

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
 * Logout user
 * With JWT, logout is handled client-side by deleting the token
 * This endpoint can be used for logging or session cleanup
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
    const decoded = jwt.verify(token, JWT_SECRET) as any;

    // Create new token with same payload but fresh expiry
    const newToken = jwt.sign(
      {
        userId: decoded.userId,
        email: decoded.email,
        googleId: decoded.googleId,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
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
 * Allows users to update their name and picture
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
 * Login with email and password
 * Public route - no authentication required
 */
export async function loginWithPassword(req: Request, res: Response): Promise<Response> {
  try {
    const { email, password } = req.body;

    // Validate inputs
    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
    }

    // Get user service
    const userService = getUserService();

    // Check if account is locked
    const isLocked = await userService.isAccountLocked(email);
    if (isLocked) {
      return res.status(429).json({
        error: 'Too Many Requests',
        message: 'Account is temporarily locked due to too many failed login attempts. Please try again in 15 minutes.',
      });
    }

    // Find user by email
    const user = await userService.findByEmail(email);

    if (!user) {
      // Don't reveal if user exists or not
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Check if user has password set
    if (!user.password_hash) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Password authentication not enabled for this account. Please use Google OAuth.',
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);

    if (!isPasswordValid) {
      await userService.recordFailedLogin(email);
      logger.warn('Failed login attempt', { email });
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid email or password',
      });
    }

    // Reset failed attempts on successful login
    await userService.resetFailedAttempts(user.id);

    // Update last login
    await userService.updateLastLogin(user.id);

    // Generate JWT token
    const token = generateToken(user);

    logger.info('User logged in with password', {
      userId: user.id,
      email: user.email,
    });

    // Return token and user data
    return res.json({
      token,
      expiresIn: JWT_EXPIRES_IN,
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
      },
    });
  } catch (error: any) {
    logger.error('Error during password login:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during login',
    });
  }
}

// Password validation helper
function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: 'Password must be at least 8 characters long' };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one uppercase letter' };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one lowercase letter' };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: 'Password must contain at least one number' };
  }
  return { valid: true };
}

// Email validation helper
function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,10}$/;
  return emailRegex.test(email);
}

/**
 * Register new user with email and password
 * Public route
 */
export async function registerWithPassword(req: Request, res: Response): Promise<Response> {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email and password are required',
      });
    }

    if (!validateEmail(email)) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid email format',
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Bad Request',
        message: passwordValidation.message,
      });
    }

    const userService = getUserService();

    // Check if user already exists
    const existingUser = await userService.findByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'User with this email already exists',
      });
    }

    // Create user
    const user = await userService.createUserWithPassword({ email, password, name });

    // Generate banner (fire and forget)
    generateBannerAsync(user.id, user.name || user.email);

    // Provision user in Authentik for Nextcloud SSO access (fire and forget)
    provisionAuthentikUser({ email, name, password }).catch(() => {});

    // Create verification token and send email
    const verificationToken = await userService.createVerificationToken(user.id);

    if (authEmailService) {
      await authEmailService.sendVerificationEmail(email, verificationToken);
    }

    logger.info('User registered', { userId: user.id, email });

    return res.status(201).json({
      success: true,
      message: 'Registration successful. Please check your email to verify your account.',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
      },
    });
  } catch (error: any) {
    logger.error('Error during registration:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during registration',
    });
  }
}

/**
 * Verify email with token
 * Public route
 */
export async function verifyEmail(req: Request, res: Response): Promise<Response> {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Token is required',
      });
    }

    const userService = getUserService();
    const verified = await userService.verifyEmail(token);

    if (!verified) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid or expired verification token',
      });
    }

    logger.info('Email verified successfully');

    return res.json({
      success: true,
      message: 'Email verified successfully. You can now login.',
    });
  } catch (error: any) {
    logger.error('Error verifying email:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during email verification',
    });
  }
}

/**
 * Request password reset
 * Public route
 */
export async function forgotPassword(req: Request, res: Response): Promise<Response> {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Email is required',
      });
    }

    const userService = getUserService();
    const token = await userService.createPasswordResetToken(email);

    // Always return success even if user doesn't exist (security best practice)
    if (token && authEmailService) {
      await authEmailService.sendPasswordResetEmail(email, token);
      logger.info('Password reset requested', { email });
    }

    return res.json({
      success: true,
      message: 'If an account exists with this email, a password reset link has been sent.',
    });
  } catch (error: any) {
    logger.error('Error during password reset request:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during password reset request',
    });
  }
}

/**
 * Reset password with token
 * Public route
 */
export async function resetPassword(req: Request, res: Response): Promise<Response> {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Token and password are required',
      });
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
      return res.status(400).json({
        error: 'Bad Request',
        message: passwordValidation.message,
      });
    }

    const userService = getUserService();
    const success = await userService.resetPassword(token, password);

    if (!success) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'Invalid or expired reset token',
      });
    }

    logger.info('Password reset successfully');

    return res.json({
      success: true,
      message: 'Password reset successfully. You can now login with your new password.',
    });
  } catch (error: any) {
    logger.error('Error resetting password:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: 'An error occurred during password reset',
    });
  }
}

// ============================================================================
// WebAuthn (Passkeys) Endpoints
// ============================================================================

const WEBAUTHN_CHALLENGE_TTL = 300; // 5 minutes

/**
 * Generate WebAuthn registration options
 * Protected route - requires JWT (user must be logged in to register a credential)
 */
export async function webauthnRegisterOptions(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { attachment } = req.body; // 'cross-platform' | 'platform' | undefined
    const webauthnService = getWebAuthnService();
    const options = await webauthnService.generateRegistrationOpts(user.id, user.email, attachment);

    // Store challenge in cache
    if (authCache) {
      await authCache.set(`webauthn:reg:${user.id}`, options.challenge, WEBAUTHN_CHALLENGE_TTL);
    }

    return res.json(options);
  } catch (error: any) {
    logger.error('Error generating WebAuthn registration options:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Verify WebAuthn registration response and store credential
 * Protected route - requires JWT
 */
export async function webauthnRegisterVerify(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { response, friendlyName, attachment } = req.body;
    if (!response) {
      return res.status(400).json({ error: 'Bad Request', message: 'Response is required' });
    }

    // Retrieve challenge from cache
    if (!authCache) {
      return res.status(500).json({ error: 'Internal server error', message: 'Cache unavailable' });
    }

    const challenge = await authCache.get(`webauthn:reg:${user.id}`);
    if (!challenge) {
      return res.status(400).json({ error: 'Bad Request', message: 'Challenge expired or not found' });
    }

    // Delete challenge after use
    await authCache.del(`webauthn:reg:${user.id}`);

    const webauthnService = getWebAuthnService();
    const verification = await webauthnService.verifyRegistration(
      response,
      challenge,
      user.id,
      friendlyName,
      attachment
    );

    return res.json({ verified: verification.verified });
  } catch (error: any) {
    logger.error('Error verifying WebAuthn registration:', error);
    return res.status(400).json({ error: 'Verification failed', message: error.message });
  }
}

/**
 * Generate WebAuthn authentication options
 * Public route (rate limited) - for login
 */
export async function webauthnAuthOptions(req: Request, res: Response): Promise<Response> {
  try {
    const { attachment } = req.body; // 'cross-platform' | undefined
    const webauthnService = getWebAuthnService();
    const options = await webauthnService.generateAuthenticationOpts(attachment);

    // Store challenge in cache keyed by challenge value
    if (authCache) {
      await authCache.set(`webauthn:auth:${options.challenge}`, '1', WEBAUTHN_CHALLENGE_TTL);
    }

    return res.json(options);
  } catch (error: any) {
    logger.error('Error generating WebAuthn auth options:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Verify WebAuthn authentication response and return JWT
 * Public route (rate limited) - for login
 */
export async function webauthnAuthVerify(req: Request, res: Response): Promise<Response> {
  try {
    const { response, challenge } = req.body;
    if (!response || !challenge) {
      return res.status(400).json({ error: 'Bad Request', message: 'Response and challenge are required' });
    }

    // Verify challenge exists in cache
    if (!authCache) {
      return res.status(500).json({ error: 'Internal server error', message: 'Cache unavailable' });
    }

    const challengeExists = await authCache.get(`webauthn:auth:${challenge}`);
    if (!challengeExists) {
      return res.status(400).json({ error: 'Bad Request', message: 'Challenge expired or not found' });
    }

    // Delete challenge after use
    await authCache.del(`webauthn:auth:${challenge}`);

    const webauthnService = getWebAuthnService();
    const { verified, userId } = await webauthnService.verifyAuthentication(response, challenge);

    if (!verified) {
      return res.status(401).json({ error: 'Unauthorized', message: 'Authentication failed' });
    }

    // Get user and generate JWT
    const userService = getUserService();
    const user = await userService.findById(userId);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized', message: 'User not found' });
    }

    await userService.updateLastLogin(user.id);
    const token = generateToken(user);

    logger.info('User logged in via WebAuthn', { userId: user.id, email: user.email });

    return res.json({
      token,
      expiresIn: JWT_EXPIRES_IN,
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
      },
    });
  } catch (error: any) {
    logger.error('Error verifying WebAuthn authentication:', error);
    return res.status(401).json({ error: 'Authentication failed', message: error.message });
  }
}

/**
 * List WebAuthn credentials for the authenticated user
 * Protected route - requires JWT
 */
export async function webauthnListCredentials(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const webauthnService = getWebAuthnService();
    const credentials = await webauthnService.getCredentialsByUserId(user.id);

    // Return credentials without public_key
    const safeCredentials = credentials.map((c) => ({
      id: c.id,
      credentialId: c.credential_id.substring(0, 16) + '...',
      deviceType: c.device_type,
      backedUp: c.backed_up,
      transports: c.transports,
      authenticatorAttachment: c.authenticator_attachment,
      friendlyName: c.friendly_name,
      lastUsedAt: c.last_used_at,
      createdAt: c.created_at,
    }));

    return res.json({ credentials: safeCredentials });
  } catch (error: any) {
    logger.error('Error listing WebAuthn credentials:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

/**
 * Delete a WebAuthn credential
 * Protected route - requires JWT
 */
export async function webauthnDeleteCredential(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const id = req.params.id as string;
    if (!id) {
      return res.status(400).json({ error: 'Bad Request', message: 'Credential ID is required' });
    }

    const webauthnService = getWebAuthnService();
    const deleted = await webauthnService.deleteCredential(id, user.id);

    if (!deleted) {
      return res.status(404).json({ error: 'Not Found', message: 'Credential not found' });
    }

    return res.json({ success: true, message: 'Credential deleted' });
  } catch (error: any) {
    logger.error('Error deleting WebAuthn credential:', error);
    return res.status(500).json({ error: 'Internal server error', message: error.message });
  }
}

// ============================================================================
// Avatar Upload & Serve
// ============================================================================

async function ensureAvatarBucket(): Promise<void> {
  if (!authMinioService) throw new Error('MinIO service not configured');
  try {
    const client = (authMinioService as any).client;
    const exists = await client.bucketExists(AVATAR_BUCKET);
    if (!exists) {
      await client.makeBucket(AVATAR_BUCKET);
      // Set public read policy for avatars
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

/**
 * Upload user avatar
 * Accepts multipart/form-data with an 'avatar' file field.
 * Supports JPEG, PNG, WebP, GIF, BMP, TIFF, AVIF, HEIF, SVG, ICO.
 * Converts to WebP, resizes to 512x512 max, stores in MinIO.
 */
export async function uploadAvatar(req: AuthenticatedRequest, res: Response): Promise<Response> {
  try {
    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

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

// ============================================================================
// Banner (Ishihara-style) Endpoints
// ============================================================================

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

// ============================================================================
// OIDC (Authentik SSO) Controllers
// ============================================================================

/**
 * GET /auth/oidc
 * Initiates OIDC authorization code flow.
 * Redirects user to Authentik login page.
 */
export async function oidcAuthInit(req: Request, res: Response): Promise<void> {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const callbackUrl = `${protocol}://${host}/auth/oidc/callback`;

    const { url } = await oidcService.getAuthorizationUrl(callbackUrl);
    res.redirect(url);
  } catch (error: any) {
    logger.error('[OIDC] Auth init failed:', error);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    res.redirect(`${protocol}://${host}/login?error=oidc_failed`);
  }
}

/**
 * GET /auth/oidc/callback
 * Handles callback from Authentik after user authenticates.
 * Creates/links user, generates JWT, redirects to frontend.
 */
export async function oidcAuthCallback(req: Request, res: Response): Promise<void> {
  try {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const frontendUrl = `${protocol}://${host}`;
    const callbackUrl = `${frontendUrl}/auth/oidc/callback`;

    const queryParams: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') queryParams[key] = value;
    }

    if (queryParams.error) {
      logger.error('[OIDC] Provider returned error', {
        error: queryParams.error,
        description: queryParams.error_description,
      });
      res.redirect(`${frontendUrl}/login?error=oidc_failed`);
      return;
    }

    const userInfo = await oidcService.handleCallback(callbackUrl, queryParams);
    const userService = getUserService();

    // 1. Find user by email (account linking)
    let user = await userService.findByEmail(userInfo.email);

    if (user) {
      // User exists — update last login
      await userService.updateLastLogin(user.id);
      logger.info('[OIDC] Existing user logged in via SSO', {
        userId: user.id,
        email: user.email,
      });
    } else {
      // 2. Create new user
      user = await userService.createUser({
        googleId: '',
        email: userInfo.email,
        name: userInfo.name || userInfo.email.split('@')[0],
        picture: userInfo.picture,
        emailVerified: userInfo.email_verified ?? true,
      });
      await userService.updateLastLogin(user.id);
      logger.info('[OIDC] New user created via SSO', {
        userId: user.id,
        email: user.email,
      });

      // Generate banner (fire and forget)
      generateBannerAsync(user.id, user.name || user.email);
    }

    // Generate JWT token
    const token = generateToken(user);

    // Redirect to frontend with token
    res.redirect(`${frontendUrl}/login?token=${token}`);
  } catch (error: any) {
    logger.error('[OIDC] Callback failed:', error);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    res.redirect(`${protocol}://${host}/login?error=oidc_failed`);
  }
}

/**
 * POST /auth/oidc/login
 * SSO login with email/password via Authentik ROPC grant.
 * Frontend collects credentials in our UI, backend authenticates against Authentik.
 */
export async function oidcLoginWithPassword(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: 'Email та пароль обов\'язкові' });
      return;
    }

    if (!oidcService.isOidcConfigured()) {
      res.status(501).json({ message: 'SSO не налаштовано' });
      return;
    }

    const userInfo = await oidcService.loginWithCredentials(email, password);
    const userService = getUserService();

    // Find or create user
    let user = await userService.findByEmail(userInfo.email);

    if (user) {
      await userService.updateLastLogin(user.id);
      logger.info('[OIDC] Existing user logged in via SSO (ROPC)', {
        userId: user.id,
        email: user.email,
      });
    } else {
      user = await userService.createUser({
        googleId: '',
        email: userInfo.email,
        name: userInfo.name || userInfo.email.split('@')[0],
        picture: userInfo.picture,
        emailVerified: userInfo.email_verified ?? true,
      });
      await userService.updateLastLogin(user.id);
      logger.info('[OIDC] New user created via SSO (ROPC)', {
        userId: user.id,
        email: user.email,
      });

      generateBannerAsync(user.id, user.name || user.email);
    }

    const token = generateToken(user);
    res.json({ token, user: { id: user.id, email: user.email, name: user.name, picture: user.picture } });
  } catch (error: any) {
    logger.error('[OIDC] ROPC login failed:', error);

    // Map errors to user-friendly messages
    const msg = error.message?.includes('invalid_grant')
      ? 'Невірний email або пароль'
      : error.message?.includes('Unexpected flow stage')
        ? 'Непідтримуваний крок автентифікації (можливо, потрібна MFA)'
        : 'Помилка автентифікації через SSO';

    res.status(401).json({ message: msg });
  }
}

// ============================================================================
// Diia Auth Controllers
// ============================================================================

const DIIA_SESSION_TTL = 600; // 10 minutes

/**
 * GET /auth/diia
 * Initiates Diia authentication flow.
 * Calls Diia Business API to get a deeplink/QR session, stores pending session in Redis,
 * then redirects frontend to /login with Diia params so it can show the QR modal.
 */
export async function diiaAuthInit(req: Request, res: Response): Promise<void> {
  try {
    const diiaService = getDiiaService();

    if (!diiaService.isConfigured()) {
      const frontendUrl = (() => {
        const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        return `${protocol}://${host}`;
      })();
      res.redirect(`${frontendUrl}/login?error=diia_not_configured`);
      return;
    }

    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    const callbackUrl = `${baseUrl}/auth/diia/callback`;

    const session = await diiaService.initAuthSession(callbackUrl);
    const { requestId, hashedRequestId, deeplink } = session;

    // Store pending session under BOTH keys:
    // - plain requestId  → for frontend polling (/auth/diia/status/:sessionId)
    // - hashedRequestId  → for Diia webhook lookup (X-Document-Request-Trace-Id)
    if (authCache) {
      const pending = JSON.stringify({ status: 'pending' });
      await authCache.set(`diia:session:${requestId}`, pending, DIIA_SESSION_TTL);
      await authCache.set(`diia:session:${hashedRequestId}`, pending, DIIA_SESSION_TTL);
    }

    // Redirect frontend to login page with Diia deeplink params (for QR modal)
    const params = new URLSearchParams({
      diia_session: requestId,
      diia_deeplink: deeplink,
    });
    res.redirect(`${baseUrl}/login?${params.toString()}`);
  } catch (error: any) {
    logger.error('[Diia] Auth init failed:', error);
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    res.redirect(`${protocol}://${host}/login?error=diia_failed`);
  }
}

/**
 * POST /auth/diia/callback
 * Diia sends the signed auth package to this webhook after user completes auth in the app.
 * Header X-Document-Request-Trace-Id contains our requestId (hashed).
 *
 * The body is an encrypted/signed package from Diia.
 * Full decryption requires the IIT crypto library + private key (future work).
 * For now we:
 *  1. Acknowledge with { success: true } (required by Diia — must respond within 30s)
 *  2. Mark the Redis session as "complete" so the frontend polling detects it
 *  3. Create/find user keyed by requestId — identity extraction is done after IIT integration
 */
export async function diiaAuthCallback(req: Request, res: Response): Promise<Response> {
  // Diia expects { success: true } within 30 seconds
  const traceId = (req.headers['x-document-request-trace-id'] as string) || '';
  logger.info('[Diia] Webhook received', { traceId, contentType: req.headers['content-type'] });

  try {
    if (!traceId) {
      return res.status(400).json({ success: false, error: 'Missing X-Document-Request-Trace-Id' });
    }

    const userService = getUserService();
    if (!userService) {
      return res.status(503).json({ success: false, error: 'Service unavailable' });
    }

    // The traceId is our hashed requestId. Look up the original session in Redis.
    // We stored it as diia:session:{hashedRequestId}
    const sessionKey = `diia:session:${traceId}`;
    let sessionData: { status: string; requestId?: string } | null = null;

    if (authCache) {
      const raw = await authCache.get(sessionKey);
      if (raw) sessionData = JSON.parse(raw);
    }

    // Create a placeholder user for the Diia session
    // Full identity will be extracted after IIT crypto integration
    const email = `diia_${traceId.substring(0, 16)}@diia.legal.org.ua`;
    const name = 'Дія Користувач';

    let user = await userService.findByEmail(email);
    if (!user) {
      user = await userService.createUser({
        googleId: '',
        email,
        name,
        emailVerified: true,
      });
      logger.info('[Diia] Created user from webhook', { userId: user.id, traceId });
      generateBannerAsync(user.id, name);
      provisionAuthentikUser({ email, name }).catch(() => {});
    } else {
      await userService.updateLastLogin(user.id);
      logger.info('[Diia] Existing user webhook auth', { userId: user.id, traceId });
    }

    // Update Redis session: mark complete
    if (authCache) {
      await authCache.set(
        sessionKey,
        JSON.stringify({ status: 'complete', userId: user.id }),
        DIIA_SESSION_TTL
      );
    }

    // Always respond { success: true } — required by Diia within 30s
    return res.json({ success: true });
  } catch (error: any) {
    logger.error('[Diia] Webhook failed:', error);
    // Still return success to Diia to avoid retries
    return res.json({ success: true });
  }
}

/**
 * GET /auth/diia/status/:sessionId
 * Frontend polls this to check if the Diia auth session has completed.
 * Returns { status: 'pending' | 'complete', token? }.
 */
export async function diiaAuthStatus(req: Request, res: Response): Promise<Response> {
  const { sessionId } = req.params;

  if (!authCache) {
    return res.status(503).json({ error: 'Cache unavailable' });
  }

  const raw = await authCache.get(`diia:session:${sessionId}`);
  if (!raw) {
    return res.status(404).json({ status: 'expired' });
  }

  const session = JSON.parse(raw) as { status: string; userId?: string };

  if (session.status === 'complete' && session.userId) {
    const userService = getUserService();
    if (!userService) return res.status(503).json({ error: 'Service unavailable' });

    const user = await userService.findById(session.userId);
    if (!user) return res.status(404).json({ status: 'expired' });

    // Consume the session
    await authCache.del(`diia:session:${sessionId}`);
    const token = generateToken(user);
    return res.json({ status: 'complete', token });
  }

  return res.json({ status: session.status });
}
