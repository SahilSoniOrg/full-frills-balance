import type { NotificationResponse } from 'expo-notifications';
import { SMS_REVIEW_NOTIFICATION_TYPE } from '@/src/services/notification/NotificationService';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import type { WorkplaceId } from '@/src/types/ids';
import { storage } from '@/src/utils/storage';
import { safeParseJSON } from '@/src/utils/serialization';

const PENDING_KEY = 'sms_pending_notification_intent';
const HANDLED_KEY = 'sms_handled_notification_response';
export interface PendingSmsNotificationIntent {
  responseId: string;
  receivedAt: number;
  inboxRecordId?: string;
  workplaceId?: string;
  grouped: boolean;
}

/** Captures taps before launch gates mount. Contains only opaque local identities. */
export class SmsNotificationIntentStore {
  private pending: PendingSmsNotificationIntent | null =
    safeParseJSON<PendingSmsNotificationIntent | null>(storage.getString(PENDING_KEY), null);
  private listeners = new Set<() => void>();
  getSnapshot = () => this.pending;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  capture(response: NotificationResponse): void {
    if (response.actionIdentifier !== 'expo.modules.notifications.actions.DEFAULT') return;
    const request = response.notification.request;
    const data = request.content.data;
    if (data?.type !== SMS_REVIEW_NOTIFICATION_TYPE) return;
    const responseId = `${request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
    if (storage.getString(HANDLED_KEY) === responseId || this.pending?.responseId === responseId)
      return;
    if (this.pending && this.pending.receivedAt > response.notification.date) return;
    this.pending = {
      responseId,
      receivedAt: response.notification.date,
      inboxRecordId: typeof data.inboxRecordId === 'string' ? data.inboxRecordId : undefined,
      workplaceId: typeof data.workplaceId === 'string' ? data.workplaceId : undefined,
      grouped: data.grouped === true,
    };
    storage.set(PENDING_KEY, JSON.stringify(this.pending));
    this.listeners.forEach(listener => listener());
  }

  complete(responseId: string): void {
    if (this.pending?.responseId !== responseId) return;
    storage.set(HANDLED_KEY, responseId);
    storage.remove(PENDING_KEY);
    this.pending = null;
    this.listeners.forEach(listener => listener());
  }

  async targetWorkplace(
    intent: PendingSmsNotificationIntent,
    current: WorkplaceId,
  ): Promise<WorkplaceId> {
    if (!intent.workplaceId || intent.workplaceId === current) return current;
    const original = await workplaceRepository.find(intent.workplaceId as WorkplaceId);
    // A deleted workplace cannot be selected. The shared Device feed is still reviewable.
    return original?.id ?? current;
  }
}
export const smsNotificationIntentStore = new SmsNotificationIntentStore();
