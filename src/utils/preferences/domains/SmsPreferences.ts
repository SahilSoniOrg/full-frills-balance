import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

/** SMS import preferences Interface. */
export class SmsPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get isSmsImportEnabled(): boolean {
    return this.store.getSnapshot().isSmsImportEnabled ?? false;
  }

  setIsSmsImportEnabled(enabled: boolean): void {
    this.store.update({ isSmsImportEnabled: enabled });
  }

  observeSmsImportEnabled(): Observable<boolean> {
    return this.store.observe('isSmsImportEnabled');
  }
}
