import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

/** Privacy / lock preferences Interface. */
export class PrivacyPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get isPrivacyMode(): boolean {
    return this.store.isPrivacyMode;
  }

  setIsPrivacyMode(isPrivacyMode: boolean): void {
    this.store.setIsPrivacyMode(isPrivacyMode);
  }

  get isWidgetPrivacyEnabled(): boolean {
    return this.store.isWidgetPrivacyEnabled;
  }

  setIsWidgetPrivacyEnabled(isEnabled: boolean): void {
    this.store.setIsWidgetPrivacyEnabled(isEnabled);
  }

  get isAppLockEnabled(): boolean {
    return this.store.isAppLockEnabled;
  }

  setAppLockEnabled(isAppLockEnabled: boolean): void {
    this.store.setAppLockEnabled(isAppLockEnabled);
  }

  observePrivacyMode(): Observable<boolean> {
    return this.store.observe('isPrivacyMode');
  }
}
