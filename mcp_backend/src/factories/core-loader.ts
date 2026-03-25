/**
 * Core Loader — Dynamic import of @secondlayer/core (proprietary)
 *
 * Attempts to load the proprietary AI pipeline package.
 * Falls back to NoOp implementations for open-source deployments.
 *
 * Open deployment: all 45 MCP tools work, /api/chat returns 501
 * Production: full AI assistant with chat pipeline
 */

import type { CoreServices } from '@secondlayer/core-interfaces';
import { createNoOpCoreServices } from '../services/noop/index.js';
import { logger } from '@secondlayer/shared';

let _coreServices: CoreServices | null = null;
let _isProprietaryLoaded = false;

export async function loadCoreServices(dependencies?: Record<string, unknown>): Promise<CoreServices> {
  if (_coreServices) return _coreServices;

  try {
    // Try to load proprietary @secondlayer/core
    // @ts-expect-error — @secondlayer/core is an optional proprietary package
    const core = await import('@secondlayer/core');

    if (typeof core.createCoreServices === 'function') {
      _coreServices = await core.createCoreServices(dependencies);
      _isProprietaryLoaded = true;
      logger.info('[@secondlayer/core] Proprietary AI pipeline loaded successfully');
    } else {
      throw new Error('@secondlayer/core found but createCoreServices() not exported');
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);

    if (message.includes('Cannot find module') || message.includes('MODULE_NOT_FOUND')) {
      logger.info('[core-loader] @secondlayer/core not installed — using open-source NoOp fallbacks');
    } else {
      logger.warn(`[core-loader] Failed to load @secondlayer/core: ${message} — falling back to NoOp`);
    }

    _coreServices = createNoOpCoreServices();
    _isProprietaryLoaded = false;
  }

  return _coreServices!;
}

export function isProprietaryLoaded(): boolean {
  return _isProprietaryLoaded;
}

export function getCoreServices(): CoreServices {
  if (!_coreServices) {
    throw new Error('Core services not initialized. Call loadCoreServices() first.');
  }
  return _coreServices;
}
