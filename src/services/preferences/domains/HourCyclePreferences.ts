import {
  readSystemUses24HourClock,
  resolveHourCycle,
  type HourCyclePreference,
  type ResolvedHourCycle,
} from '@/src/utils/hourCycle';
import { Observable } from 'rxjs';
import type { PreferencesStore } from '../PreferencesStore';

export class HourCyclePreferences {
  constructor(private readonly store: PreferencesStore) {}

  get preference(): HourCyclePreference {
    return this.store.getSnapshot().hourCyclePreference ?? 'system';
  }

  get resolved(): ResolvedHourCycle {
    return resolveHourCycle(this.preference, readSystemUses24HourClock());
  }

  setPreference(hourCyclePreference: HourCyclePreference): void {
    this.store.update({ hourCyclePreference });
  }

  observePreference(): Observable<HourCyclePreference | undefined> {
    return this.store.observe('hourCyclePreference');
  }
}
