import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

/** Safe-to-Spend horizon preferences Interface. */
export class StsPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get safeToSpendDays(): number {
    return this.store.safeToSpendDays;
  }

  setSafeToSpendDays(days: number): void {
    this.store.setSafeToSpendDays(days);
  }

  observeSafeToSpendDays(): Observable<number> {
    return this.store.observe('safeToSpendDays');
  }
}
