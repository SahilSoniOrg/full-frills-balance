import { smsPrivacyRepository } from '@/src/data/repositories/SmsPrivacyRepository';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';

const RETENTION_MIGRATION_KEY = 'sms_raw_content_cleanup_v2_complete';

class SmsPrivacyService {
  private cleanupPromise: Promise<void> | null = null;

  cleanupLegacyContent(force = false): Promise<void> {
    if (force) {
      storage.remove(RETENTION_MIGRATION_KEY);
      if (this.cleanupPromise) {
        return this.cleanupPromise.then(() => {
          storage.remove(RETENTION_MIGRATION_KEY);
          return this.cleanupLegacyContent();
        });
      }
    }
    if (storage.getBoolean(RETENTION_MIGRATION_KEY)) return Promise.resolve();
    if (this.cleanupPromise) return this.cleanupPromise;
    this.cleanupPromise = smsPrivacyRepository
      .scrubLegacySmsContent()
      .then(() => storage.set(RETENTION_MIGRATION_KEY, true))
      .catch(error => {
        logger.warn('[SmsPrivacyService] Legacy SMS retention cleanup failed', { error });
        throw error;
      })
      .finally(() => {
        this.cleanupPromise = null;
      });
    return this.cleanupPromise;
  }
}

export const smsPrivacyService = new SmsPrivacyService();
