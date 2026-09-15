import { Observable } from 'rxjs';
import type { PrivacyPolicyAcknowledgement, UIPreferences } from '@/src/types/preferences';
import type { DevicePreferencesStore } from '../DevicePreferencesStore';
import type { PreferencesStore } from '../PreferencesStore';

export type PrivacyPrefs = Pick<
  UIPreferences,
  'isPrivacyMode' | 'isWidgetPrivacyEnabled' | 'privacyPolicyAcknowledgement'
>;

/** Privacy mask is User; app lock is Device. */
export class PrivacyPreferences {
  constructor(
    private readonly user: PreferencesStore,
    private readonly device: DevicePreferencesStore,
  ) {}

  get isPrivacyMode(): boolean {
    return this.user.getSnapshot().isPrivacyMode;
  }

  setIsPrivacyMode(isPrivacyMode: boolean): void {
    this.user.update({ isPrivacyMode });
  }

  get isWidgetPrivacyEnabled(): boolean {
    return this.user.getSnapshot().isWidgetPrivacyEnabled;
  }

  setIsWidgetPrivacyEnabled(isEnabled: boolean): void {
    this.user.update({ isWidgetPrivacyEnabled: isEnabled });
  }

  get privacyPolicyAcknowledgement(): PrivacyPolicyAcknowledgement | undefined {
    return this.user.getSnapshot().privacyPolicyAcknowledgement;
  }

  setPrivacyPolicyAcknowledgement(acknowledgement: PrivacyPolicyAcknowledgement): void {
    this.user.update({ privacyPolicyAcknowledgement: acknowledgement });
  }

  clearPrivacyPolicyAcknowledgement(): void {
    this.user.update({ privacyPolicyAcknowledgement: undefined });
  }

  get isAppLockEnabled(): boolean {
    return this.device.isAppLockEnabled;
  }

  setAppLockEnabled(isAppLockEnabled: boolean): void {
    this.device.setAppLockEnabled(isAppLockEnabled);
  }

  observePrivacyMode(): Observable<boolean> {
    return this.user.observe('isPrivacyMode');
  }

  observeWidgetPrivacyEnabled(): Observable<boolean> {
    return this.user.observe('isWidgetPrivacyEnabled');
  }

  observePrivacyPolicyAcknowledgement(): Observable<PrivacyPolicyAcknowledgement | undefined> {
    return this.user.observe('privacyPolicyAcknowledgement');
  }

  observeAppLockEnabled(): Observable<boolean> {
    return this.device.observe('isAppLockEnabled');
  }
}
