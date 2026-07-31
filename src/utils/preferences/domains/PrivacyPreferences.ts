import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

/** Privacy / lock preferences Interface. */
export class PrivacyPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get isPrivacyMode(): boolean {
    return this.store.getSnapshot().isPrivacyMode;
  }

  setIsPrivacyMode(isPrivacyMode: boolean): void {
    this.store.update({ isPrivacyMode });
  }

  get isWidgetPrivacyEnabled(): boolean {
    return this.store.getSnapshot().isWidgetPrivacyEnabled;
  }

  setIsWidgetPrivacyEnabled(isEnabled: boolean): void {
    this.store.update({ isWidgetPrivacyEnabled: isEnabled });
  }

  get isAppLockEnabled(): boolean {
    return this.store.getSnapshot().isAppLockEnabled;
  }

  setAppLockEnabled(isAppLockEnabled: boolean): void {
    this.store.update({ isAppLockEnabled });
  }

  observePrivacyMode(): Observable<boolean> {
    return this.store.observe('isPrivacyMode');
  }

  observeWidgetPrivacyEnabled(): Observable<boolean> {
    return this.store.observe('isWidgetPrivacyEnabled');
  }

  observeAppLockEnabled(): Observable<boolean> {
    return this.store.observe('isAppLockEnabled');
  }
}
