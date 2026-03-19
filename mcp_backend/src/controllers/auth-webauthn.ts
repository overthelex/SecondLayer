/**
 * Auth WebAuthn — Passkey/WebAuthn handlers
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger.js';
import { getUserService, getWebAuthnService } from '../middleware/dual-auth.js';
import {
  type AuthenticatedRequest,
  generateToken,
  getAuthCache,
  JWT_EXPIRES_IN,
} from './auth-common.js';

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
    const authCache = getAuthCache();
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
    const authCache = getAuthCache();
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
    const authCache = getAuthCache();
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
    const authCache = getAuthCache();
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
