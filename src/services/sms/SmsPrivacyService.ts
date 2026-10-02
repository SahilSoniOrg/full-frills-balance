import { smsPrivacyRepository } from '@/src/data/repositories/SmsPrivacyRepository';
import { logger } from '@/src/utils/logger';
import { storage } from '@/src/utils/storage';

const PRIVACY_MIGRATION_KEY = 'sms_privacy_cleanup_v4_complete';

class SmsPrivacyService {
  private cleanupPromise: Promise<void> | null = null;

  cleanupLegacyContent(force = false): Promise<void> {
    if (force) {
      storage.remove(PRIVACY_MIGRATION_KEY);
      if (this.cleanupPromise) {
        return this.cleanupPromise.then(() => {
          storage.remove(PRIVACY_MIGRATION_KEY);
          return this.cleanupLegacyContent();
        });
      }
    }
    if (storage.getBoolean(PRIVACY_MIGRATION_KEY)) return Promise.resolve();
    if (this.cleanupPromise) return this.cleanupPromise;
    this.cleanupPromise = smsPrivacyRepository
      .sanitizeLegacySmsData()
      .then(() => storage.set(PRIVACY_MIGRATION_KEY, true))
      .catch(error => {
        logger.warn('[SmsPrivacyService] Legacy SMS privacy cleanup failed', { error });
        throw error;
      })
      .finally(() => {
        this.cleanupPromise = null;
      });
    return this.cleanupPromise;
  }
}

export const smsPrivacyService = new SmsPrivacyService();
