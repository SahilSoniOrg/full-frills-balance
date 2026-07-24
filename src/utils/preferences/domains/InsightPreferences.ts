import type { PreferencesStore } from '../PreferencesStore';

/** Insight dismissal preferences Interface. */
export class InsightPreferences {
  constructor(private readonly store: PreferencesStore) {}

  get dismissedPatternIds(): string[] {
    return this.store.getSnapshot().dismissedPatternIds;
  }

  dismissPattern(id: string): void {
    const current = this.store.getSnapshot().dismissedPatternIds;
    if (!current.includes(id)) {
      this.store.update({
        dismissedPatternIds: [...current, id],
      });
    }
  }

  undismissPattern(id: string): void {
    const current = this.store.getSnapshot().dismissedPatternIds;
    if (current.includes(id)) {
      this.store.update({
        dismissedPatternIds: current.filter(pId => pId !== id),
      });
    }
  }
}
