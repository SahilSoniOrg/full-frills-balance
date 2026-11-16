/**
 * Web/Node ID Generator
 *
 * Uses the standard Web Crypto API: `crypto.randomUUID()`.
 * This works in:
 * 1. Modern Browsers (Chrome 92+, Firefox 95+, Safari 15.4+)
 * 2. Node.js 19+ (global.crypto)
 * 3. Node.js 16.7+ (via correct polyfills or if globalThis.crypto is set)
 *
 * If completely unavailable, we fall back to a simple Math.random implementation
 * to ensure we always return a string as required by WatermelonDB.
 */
export const generator = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  // Fallback UUID v4 generator
  // (Used if environment is very old or stripped down)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};
