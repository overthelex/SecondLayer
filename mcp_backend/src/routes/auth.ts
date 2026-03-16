/**
 * Authentication Routes
 * Handles Google OAuth, password auth, registration, email verification, and password reset
 */

import { Router } from 'express';
import passport from 'passport';
import multer from 'multer';
import * as authController from '../controllers/auth.js';
import { getDiiaService } from '../services/diia-service.js';
import { authRateLimit, passwordResetRateLimit } from '../middleware/rate-limit.js';
import { requireJWT } from '../middleware/dual-auth.js';

const avatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
});

const router: Router = Router();

/**
 * @route   POST /auth/login
 * @desc    Login with email and password
 * @access  Public (rate limited)
 */
router.post('/login', authRateLimit as any, authController.loginWithPassword as any);

/**
 * @route   POST /auth/register
 * @desc    Register new user with email and password
 * @access  Public (rate limited)
 */
router.post('/register', authRateLimit as any, authController.registerWithPassword as any);

/**
 * @route   POST /auth/verify-email
 * @desc    Verify email with token
 * @access  Public
 */
router.post('/verify-email', authController.verifyEmail as any);

/**
 * @route   POST /auth/forgot-password
 * @desc    Request password reset email
 * @access  Public (strictly rate limited)
 */
router.post('/forgot-password', passwordResetRateLimit as any, authController.forgotPassword as any);

/**
 * @route   POST /auth/reset-password
 * @desc    Reset password with token
 * @access  Public (rate limited)
 */
router.post('/reset-password', authRateLimit as any, authController.resetPassword as any);

/**
 * @route   GET /auth/google
 * @desc    Initiate Google OAuth flow
 * @access  Public
 *
 * @route   GET /auth/google/callback
 * @desc    Google OAuth callback URL
 * @access  Public
 *
 * Only registered when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set.
 */
/**
 * Build callback URL dynamically from request host.
 * This allows OAuth to work from both legal.org.ua and stage.legal.org.ua.
 * The redirect URI must also be registered in Google Cloud Console.
 */
function getCallbackURL(req: any): string {
  if (process.env.GOOGLE_CALLBACK_URL) {
    return process.env.GOOGLE_CALLBACK_URL;
  }
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  return `${protocol}://${host}/auth/google/callback`;
}

/**
 * @route   POST /auth/google/mobile
 * @desc    Authenticate via Google idToken from mobile SDK
 * @access  Public (rate limited)
 */
router.post('/google/mobile', authRateLimit as any, authController.googleMobileAuth as any);

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  router.get('/google', (req, res, next) => {
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      session: false,
      callbackURL: getCallbackURL(req),
    } as any)(req, res, next);
  });

  router.get(
    '/google/callback',
    (req, res, next) => {
      passport.authenticate('google', {
        session: false,
        failureRedirect: process.env.FRONTEND_URL + '/login?error=oauth_failed',
        callbackURL: getCallbackURL(req),
      } as any)(req, res, next);
    },
    (authController.googleOAuthCallback as any)
  );
} else {
  router.get('/google', (_req, res) => {
    res.status(501).json({ error: 'Google OAuth is not configured' });
  });
  router.get('/google/callback', (_req, res) => {
    res.status(501).json({ error: 'Google OAuth is not configured' });
  });
}

/**
 * OIDC (Authentik SSO) routes.
 * Only registered when OIDC_DISCOVERY_URL is set.
 *
 * @route   GET /auth/oidc
 * @desc    Initiate OIDC flow — redirects to Authentik login
 * @access  Public
 *
 * @route   GET /auth/oidc/callback
 * @desc    OIDC callback — exchanges code for token, creates/links user
 * @access  Public
 */
if (process.env.OIDC_DISCOVERY_URL && process.env.OIDC_CLIENT_ID) {
  router.get('/oidc', authController.oidcAuthInit as any);
  router.get('/oidc/callback', authController.oidcAuthCallback as any);
  router.post('/oidc/login', authRateLimit as any, authController.oidcLoginWithPassword as any);
} else {
  router.get('/oidc', (_req, res) => {
    res.status(501).json({ error: 'OIDC/SSO is not configured' });
  });
  router.get('/oidc/callback', (_req, res) => {
    res.status(501).json({ error: 'OIDC/SSO is not configured' });
  });
  router.post('/oidc/login', (_req, res) => {
    res.status(501).json({ error: 'OIDC/SSO is not configured' });
  });
}

/**
 * Diia (Дія) OAuth routes.
 * Only registered when DIIA_AUTH_ACQUIRER_TOKEN is set.
 */
if (process.env.DIIA_AUTH_ACQUIRER_TOKEN) {
  /**
   * @route   GET /auth/diia
   * @desc    Initiate Diia auth flow — calls Diia Business API, returns deeplink for QR
   * @access  Public
   */
  router.get('/diia', authController.diiaAuthInit as any);

  /**
   * @route   POST /auth/diia/callback
   * @desc    Diia webhook — called after user authenticates in the app
   *          Header: X-Document-Request-Trace-Id = requestId
   *          Must respond { success: true } within 30s
   * @access  Public
   */
  router.post('/diia/callback', authController.diiaAuthCallback as any);

  /**
   * @route   GET /auth/diia/status/:sessionId
   * @desc    Poll for Diia auth session completion
   * @access  Public
   */
  router.get('/diia/status/:sessionId', authController.diiaAuthStatus as any);
} else {
  router.get('/diia', (_req, res) => {
    res.status(501).json({ error: 'Diia auth is not configured' });
  });
  router.post('/diia/callback', (_req, res) => {
    res.status(501).json({ error: 'Diia auth is not configured' });
  });
  router.get('/diia/status/:sessionId', (_req, res) => {
    res.status(501).json({ error: 'Diia auth is not configured' });
  });
}

/**
 * @route   GET /auth/me
 * @desc    Get current user profile
 * @access  Protected (JWT required)
 *
 * Note: JWT authentication middleware will be applied in http-server.ts
 */
router.get('/me', (authController.getCurrentUser as any));

/**
 * @route   POST /auth/logout
 * @desc    Logout user
 * @access  Protected (JWT required)
 *
 * With JWT, logout is primarily handled client-side by deleting the token.
 * This endpoint can be used for logging or cleanup.
 */
router.post('/logout', authController.logout as any);

/**
 * @route   POST /auth/accept-attorney-offer
 * @desc    Accept attorney public offer
 * @access  Protected (JWT required, attorney only)
 */
router.post('/accept-attorney-offer', requireJWT as any, authController.acceptAttorneyOffer as any);

/**
 * @route   GET /auth/my-contracts
 * @desc    Get all signed contracts/acceptances for current user
 * @access  Protected (JWT required)
 */
router.get('/my-contracts', requireJWT as any, authController.getMyContracts as any);

/**
 * @route   POST /auth/refresh
 * @desc    Refresh JWT token
 * @access  Protected (valid JWT required)
 *
 * Takes an existing valid token and issues a new one with fresh expiry.
 */
router.post('/refresh', authController.refreshToken as any);

/**
 * @route   PUT /auth/profile
 * @desc    Update user profile
 * @access  Protected (JWT required)
 *
 * Allows authenticated users to update their profile information (name, picture).
 * Email cannot be changed as it's managed by Google OAuth.
 */
router.put('/profile', authController.updateProfile as any);

/**
 * @route   POST /auth/avatar
 * @desc    Upload user avatar (multipart/form-data, field: 'avatar')
 * @access  Protected (JWT required)
 */
router.post('/avatar', requireJWT as any, avatarUpload.single('avatar'), authController.uploadAvatar as any);

/**
 * @route   GET /auth/avatar/:userId
 * @desc    Serve user avatar image
 * @access  Public (cached)
 */
router.get('/avatar/:userId', authController.getAvatar as any);

/**
 * @route   GET /auth/banner/:userId
 * @desc    Serve user banner image (Ishihara-style)
 * @access  Public (cached)
 */
router.get('/banner/:userId', authController.getBanner as any);

/**
 * @route   POST /auth/banner/regenerate
 * @desc    Regenerate banner for current user
 * @access  Protected (JWT required)
 */
router.post('/banner/regenerate', requireJWT as any, authController.regenerateBanner as any);

// ============================================================================
// WebAuthn (Passkeys) Routes
// ============================================================================

/**
 * @route   POST /auth/webauthn/register/options
 * @desc    Generate WebAuthn registration challenge
 * @access  Protected (JWT required)
 */
router.post('/webauthn/register/options', requireJWT as any, authController.webauthnRegisterOptions as any);

/**
 * @route   POST /auth/webauthn/register/verify
 * @desc    Verify WebAuthn registration and store credential
 * @access  Protected (JWT required)
 */
router.post('/webauthn/register/verify', requireJWT as any, authController.webauthnRegisterVerify as any);

/**
 * @route   POST /auth/webauthn/auth/options
 * @desc    Generate WebAuthn authentication challenge (login)
 * @access  Public (rate limited)
 */
router.post('/webauthn/auth/options', authRateLimit as any, authController.webauthnAuthOptions as any);

/**
 * @route   POST /auth/webauthn/auth/verify
 * @desc    Verify WebAuthn authentication and return JWT (login)
 * @access  Public (rate limited)
 */
router.post('/webauthn/auth/verify', authRateLimit as any, authController.webauthnAuthVerify as any);

/**
 * @route   GET /auth/webauthn/credentials
 * @desc    List user's WebAuthn credentials
 * @access  Protected (JWT required)
 */
router.get('/webauthn/credentials', requireJWT as any, authController.webauthnListCredentials as any);

/**
 * @route   DELETE /auth/webauthn/credentials/:id
 * @desc    Delete a WebAuthn credential
 * @access  Protected (JWT required)
 */
router.delete('/webauthn/credentials/:id', requireJWT as any, authController.webauthnDeleteCredential as any);

export default router;
