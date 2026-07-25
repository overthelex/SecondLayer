/**
 * Authentication Controller — Barrel re-export
 *
 * This file re-exports all auth sub-modules so that existing importers
 * (e.g. `import * as authController from '../controllers/auth.js'`)
 * continue to work without changes.
 */

export * from './auth-common.js';
export * from './auth-google.js';
export * from './auth-password.js';
export * from './auth-webauthn.js';
export * from './auth-diia.js';
export * from './auth-oidc.js';
export * from './auth-profile.js';
