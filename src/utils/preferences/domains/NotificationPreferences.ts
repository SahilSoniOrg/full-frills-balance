import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

export type NotificationCadence = 'none' | 'daily' | 'weekly';

/** Notification cadence / schedule preferences Interface. */
export class NotificationPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get notificationCadence(): NotificationCadence {
    return this.store.notificationCadence;
  }

  setNotificationCadence(cadence: NotificationCadence): void {
    this.store.setNotificationCadence(cadence);
  }

  get notificationHour(): number {
    return this.store.notificationHour;
  }

  setNotificationHour(hour: number): void {
    this.store.setNotificationHour(hour);
  }

  get notificationMinute(): number {
    return this.store.notificationMinute;
  }

  setNotificationMinute(minute: number): void {
    this.store.setNotificationMinute(minute);
  }

  get notificationWeekday(): number {
    return this.store.notificationWeekday;
  }

  setNotificationWeekday(weekday: number): void {
    this.store.setNotificationWeekday(weekday);
  }

  setNotificationTime(hour: number, minute: number): void {
    this.store.update({ notificationHour: hour, notificationMinute: minute });
  }

  observeCadence(): Observable<NotificationCadence> {
    return this.store.observe('notificationCadence');
  }
}
