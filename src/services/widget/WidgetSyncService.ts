import { logger } from '@/src/utils/logger';
import { widgetSyncObserver } from './WidgetSyncObserver';

/**
 * WidgetSyncService — entry-point for widget data synchronisation.
 *
 * Manages the lifecycle of the {@link WidgetSyncObserver}:
 *  - `register()`   starts DB subscriptions
 *  - `unregister()` tears them down
 *  - `triggerSync()` forces an immediate push of the latest payload
 *
 * Usage:
 * ```ts
 * import { widgetSyncService } from '@/src/services/widget/WidgetSyncService';
 *
 * // In your app bootstrap
 * widgetSyncService.register();
 *
 * // On app background / teardown
 * widgetSyncService.unregister();
 * ```
 */
class WidgetSyncService {
  private _registered = false;

  /** Whether the service is currently registered */
  get registered(): boolean {
    return this._registered;
  }

  /**
   * Start the observer subscriptions and begin syncing widget data.
   * Safe to call multiple times.
   */
  register(): void {
    if (this._registered) {
      logger.debug('[WidgetSyncService] Already registered, skipping');
      return;
    }
    widgetSyncObserver.start();
    this._registered = true;
    logger.info('[WidgetSyncService] Registered — widget sync active');
  }

  /**
   * Stop the observer subscriptions and clean up.
   * Safe to call multiple times.
   */
  unregister(): void {
    if (!this._registered) {
      logger.debug('[WidgetSyncService] Not registered, skipping');
      return;
    }
    widgetSyncObserver.stop();
    this._registered = false;
    logger.info('[WidgetSyncService] Unregistered — widget sync stopped');
  }

  /**
   * Force an immediate sync with the latest cached payload.
   * Useful for testing or when an external event (e.g. push notification)
   * warrants an out-of-band refresh.
   */
  async triggerSync(): Promise<void> {
    if (!this._registered) {
      logger.warn('[WidgetSyncService] triggerSync called but service is not registered');
      return;
    }
    await widgetSyncObserver.triggerSync();
    logger.info('[WidgetSyncService] Manual sync triggered');
  }
}

/** Singleton instance */
export const widgetSyncService = new WidgetSyncService();
