import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

/**
 * Dashboard display preferences (header chart, future header metric, etc.).
 * Horizon / forecast window stays on StsPreferences.
 */
export class DashboardPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get showSafeToSpendChart(): boolean {
    return this.store.getSnapshot().showSafeToSpendChart ?? true;
  }

  setShowSafeToSpendChart(show: boolean): void {
    this.store.update({ showSafeToSpendChart: show });
  }

  observeShowSafeToSpendChart(): Observable<boolean> {
    return this.store.observe('showSafeToSpendChart');
  }
}
