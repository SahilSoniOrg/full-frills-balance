import SQLiteAdapter from '@nozbe/watermelondb/adapters/sqlite';
import { Platform } from 'react-native';

import { migrations } from '@/src/data/database/migrations';
import { schema } from '@/src/data/database/schema';
import { logger } from '@/src/utils/logger';

/**
 * JSI is enabled unconditionally on native.
 * Metro's .native.ts resolution ensures this file never runs on web.
 *
 * If a specific Android OEM causes JSI crash loops, disable via
 * remote config and rebuild — the ORM fallback path will keep the
 * app functional (slower, but alive).
 */
const useJsi = true;

if (__DEV__) {
  logger.info(`[Adapter] SQLite JSI=${useJsi}, platform=${Platform.OS}`);
}

const adapter = new SQLiteAdapter({
  schema,
  migrations,
  jsi: useJsi,
  onSetUpError: error => {
    logger.error('[Adapter] Database setup error', { error, jsi: useJsi, platform: Platform.OS });
  },
});

export default adapter;
