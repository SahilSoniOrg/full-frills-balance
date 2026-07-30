import { AppConfig } from '@/src/constants/app-config';
import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

/** Safe-to-Spend forecast horizon preferences. */
export class StsPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get safeToSpendDays(): number {
    return this.store.getSnapshot().safeToSpendDays ?? AppConfig.defaults.safeToSpendDays;
  }

  setSafeToSpendDays(days: number): void {
    this.store.update({ safeToSpendDays: days });
  }

  observeSafeToSpendDays(): Observable<number> {
    return this.store.observe('safeToSpendDays');
  }
}
