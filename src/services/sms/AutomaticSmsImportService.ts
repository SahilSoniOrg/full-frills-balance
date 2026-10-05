import { smsInboxBridge } from '@/src/services/sms/SmsInboxBridge';
import { smsSyncPipeline } from '@/src/services/sms/pipeline/smsSyncPipeline';
import { preferences } from '@/src/services/preferences';
import { storage } from '@/src/utils/storage';
import { AppConfig } from '@/src/constants';
import { logger } from '@/src/utils/logger';
import { smsReviewNotificationService } from '@/src/services/sms/SmsReviewNotificationService';
import { notificationService } from '@/src/services/notification/NotificationService';

const LAST_SMS_ID_KEY = 'automatic_sms_import_last_provider_id';
const PAGE_SIZE = AppConfig.pagination.smsImportScanLimit;
const EMPTY_PROVIDER_RETRIES = 3;
const EMPTY_PROVIDER_RETRY_MS = 400;

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

class AutomaticSmsImportService {
  private pendingRequested = false;
  private retryEmptyRequested = false;
  private settingsGeneration = 0;
  private activeRun: Promise<void> | null = null;

  async setEnabledFromSettings(
    enabled: boolean,
  ): Promise<'enabled' | 'denied' | 'never_ask_again' | 'cancelled'> {
    const generation = ++this.settingsGeneration;
    if (!enabled) {
      preferences.device.setAutomaticSmsImportEnabled(false);
      await smsInboxBridge.setAutomaticImportEnabled(false);
      return 'enabled';
    }

    const permissionResult = await smsInboxBridge.requestAutomaticImportPermissions();
    if (generation !== this.settingsGeneration) return 'cancelled';
    if (permissionResult !== 'granted') return permissionResult;

    // Notifications are optional: SMS import remains enabled if the user declines.
    if (preferences.device.getSnapshot().areSmsReviewNotificationsEnabled) {
      await notificationService.requestPermissions();
    }

    if (generation !== this.settingsGeneration) return 'cancelled';
    await smsInboxBridge.setAutomaticImportEnabled(true);
    if (generation !== this.settingsGeneration) {
      await smsInboxBridge.setAutomaticImportEnabled(
        preferences.device.isAutomaticSmsImportEnabled,
      );
      return 'cancelled';
    }
    preferences.device.setAutomaticSmsImportEnabled(true);
    try {
      await this.processPending();
    } catch {
      logger.warn('[AutomaticSmsImport] Import enabled; catch-up will retry');
    }
    return 'enabled';
  }

  async synchronizeOnAppStart(): Promise<void> {
    await preferences.loadPreferences();
    if (!preferences.device.isAutomaticSmsImportEnabled) {
      await smsInboxBridge.setAutomaticImportEnabled(false);
      return;
    }

    // Recheck OS access without prompting. Only a settings action requests permission.
    const permissionsGranted = await smsInboxBridge.hasAutomaticImportPermissions();
    await smsInboxBridge.setAutomaticImportEnabled(
      permissionsGranted && preferences.device.isAutomaticSmsImportEnabled,
    );
    if (!permissionsGranted) return;
    await this.processPending();
  }

  async processPending(retryWhenEmpty = false): Promise<void> {
    this.pendingRequested = true;
    this.retryEmptyRequested ||= retryWhenEmpty;
    if (this.activeRun) {
      await this.activeRun;
      if (this.pendingRequested) await this.processPending();
      return;
    }

    this.activeRun = this.drainPending().finally(() => {
      this.activeRun = null;
    });
    await this.activeRun;
  }

  private async drainPending(): Promise<void> {
    while (this.pendingRequested) {
      this.pendingRequested = false;
      const retryWhenEmpty = this.retryEmptyRequested;
      this.retryEmptyRequested = false;
      await this.scanMissedMessages(retryWhenEmpty);
      await smsReviewNotificationService.flush();
    }
  }

  private async scanMissedMessages(retryWhenEmpty: boolean): Promise<void> {
    await preferences.loadPreferences();
    if (!preferences.device.isAutomaticSmsImportEnabled) return;
    if (!(await smsInboxBridge.hasAutomaticImportPermissions())) return;

    const workplaceId = preferences.device.activeWorkplaceId;
    if (!workplaceId) return;

    let cursor = storage.getString(LAST_SMS_ID_KEY);
    if (!cursor) {
      const baselineId = await smsInboxBridge.getLatestSmsId();
      if (!baselineId) return;
      await smsSyncPipeline.scanInbox(workplaceId, PAGE_SIZE, undefined, {
        promptForPermission: false,
        origin: 'initial',
      });
      storage.set(LAST_SMS_ID_KEY, baselineId);
      cursor = baselineId;
    }

    let emptyRetries = 0;
    while (preferences.device.isAutomaticSmsImportEnabled) {
      if (!(await smsInboxBridge.hasAutomaticImportPermissions())) return;
      const messages = await smsInboxBridge.getMessagesAfterId(cursor, PAGE_SIZE);
      if (messages.length === 0) {
        if (!retryWhenEmpty || emptyRetries >= EMPTY_PROVIDER_RETRIES) return;
        emptyRetries += 1;
        await delay(EMPTY_PROVIDER_RETRY_MS);
        continue;
      }

      await smsSyncPipeline.scanMessages(workplaceId, messages, undefined, {
        origin: retryWhenEmpty ? 'arrival' : 'catch_up',
      });
      cursor = messages[messages.length - 1].id;
      storage.set(LAST_SMS_ID_KEY, cursor);
      emptyRetries = 0;
    }
  }

  async processHeadlessArrival(retryWhenEmpty: boolean): Promise<void> {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await this.processPending(retryWhenEmpty);
        return;
      } catch {
        logger.warn('[AutomaticSmsImport] Background import attempt failed', { attempt });
        if (attempt < 3) await delay(attempt * 1_500);
      }
    }
    logger.error(
      '[AutomaticSmsImport] Background import exhausted retries; it will retry on the next trigger',
    );
  }
}

export const automaticSmsImportService = new AutomaticSmsImportService();
