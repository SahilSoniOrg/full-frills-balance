import type { PreferencesStore } from '../PreferencesStore';

/** Insight dismissal preferences Interface. */
export class InsightPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get dismissedPatternIds(): string[] {
    return this.store.dismissedPatternIds;
  }

  dismissPattern(id: string): void {
    this.store.dismissPattern(id);
  }

  undismissPattern(id: string): void {
    this.store.undismissPattern(id);
  }
}
