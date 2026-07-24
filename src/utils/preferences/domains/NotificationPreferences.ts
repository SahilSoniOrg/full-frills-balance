import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

export type NotificationCadence = 'none' | 'daily' | 'weekly';

/** Notification cadence / schedule preferences Interface. */
export class NotificationPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get notificationCadence(): NotificationCadence {
    return this.store.getSnapshot().notificationCadence || 'none';
  }

  setNotificationCadence(cadence: NotificationCadence): void {
    this.store.update({ notificationCadence: cadence });
  }

  get notificationHour(): number {
    return this.store.getSnapshot().notificationHour ?? 10;
  }

  setNotificationHour(hour: number): void {
    this.store.update({ notificationHour: hour });
  }

  get notificationMinute(): number {
    return this.store.getSnapshot().notificationMinute ?? 0;
  }

  setNotificationMinute(minute: number): void {
    this.store.update({ notificationMinute: minute });
  }

  get notificationWeekday(): number {
    return this.store.getSnapshot().notificationWeekday ?? 1;
  }

  setNotificationWeekday(weekday: number): void {
    this.store.update({ notificationWeekday: weekday });
  }

  setNotificationTime(hour: number, minute: number): void {
    this.store.update({ notificationHour: hour, notificationMinute: minute });
  }

  observeCadence(): Observable<NotificationCadence> {
    return this.store.observe('notificationCadence');
  }
}
