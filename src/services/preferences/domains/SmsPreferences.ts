import { Observable } from 'rxjs';
import type { DevicePreferencesStore } from '../DevicePreferencesStore';

/** Device SMS listen — one switch for this install. */
export class SmsPreferences {
  constructor(private readonly device: DevicePreferencesStore) {}

  get isSmsImportEnabled(): boolean {
    return this.device.isSmsImportEnabled;
  }

  setIsSmsImportEnabled(enabled: boolean): void {
    this.device.setSmsImportEnabled(enabled);
  }

  observeSmsImportEnabled(): Observable<boolean> {
    return this.device.observe('isSmsImportEnabled');
  }
}
