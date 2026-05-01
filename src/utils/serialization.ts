import { logger } from '@/src/utils/logger';

/**
 * Safely parse a JSON string with an optional fallback.
 * Logs an error if parsing fails.
 */
export function safeParseJSON<T>(json: string | null | undefined, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch (error) {
    logger.error('[Serialization] Failed to parse JSON', {
      error,
      json: json.substring(0, 100),
    });
    return fallback;
  }
}

/**
 * Efficiently converts Uint8Array to Base64 string.
 * Uses chunking to avoid stack size limits and minimize memory churn.
 */
export function bytesToBase64(bytes: Uint8Array): string {
  // Use chunks to avoid "Maximum call stack size exceeded" with String.fromCharCode.apply
  const CHUNK_SIZE = 0x8000; // 32KB
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, i + CHUNK_SIZE);
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}
