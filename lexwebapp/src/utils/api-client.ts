/**
 * Re-export shim — preserves all existing imports.
 * New code should import from '@/utils/api' or '@/utils/api/client' directly.
 */
export { default } from './api/client';
export { api } from './api/index';
