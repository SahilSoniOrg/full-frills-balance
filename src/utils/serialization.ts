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
