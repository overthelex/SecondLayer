/**
 * Crypto utility functions — base64 encoding/decoding for Uint8Array.
 */

/**
 * Encode Uint8Array to URL-safe base64 string.
 */
export function encodeBase64(data: Uint8Array): string {
  const binary = String.fromCharCode(...data);
  return btoa(binary);
}

/**
 * Decode base64 string to Uint8Array.
 */
export function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Generate cryptographically random bytes.
 */
export function randomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length));
}

/**
 * Cast Uint8Array to BufferSource for Web Crypto API compatibility.
 * TS 5.9+ treats Uint8Array.buffer as ArrayBufferLike (includes SharedArrayBuffer),
 * but Web Crypto typings require ArrayBuffer. This is a type-level cast only —
 * at runtime Uint8Array is already accepted by all Web Crypto implementations.
 */
export function toBuffer(data: Uint8Array): BufferSource {
  return data as unknown as BufferSource;
}

/**
 * Constant-time comparison of two Uint8Arrays.
 */
export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}
