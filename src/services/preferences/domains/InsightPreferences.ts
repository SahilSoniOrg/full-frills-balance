import { WorkplaceId } from '@/src/types/ids';
import type { WorkplacePreferencesStore } from '../WorkplacePreferencesStore';

/** Insight dismissal — workplace bag. */
export class InsightPreferences {
  constructor(private readonly workplace: WorkplacePreferencesStore) {}

  dismissedPatternIds(workplaceId: WorkplaceId): string[] {
    return this.workplace.getSnapshot(workplaceId).dismissedPatternIds;
  }

  dismissPattern(workplaceId: WorkplaceId, id: string): void {
    const current = this.dismissedPatternIds(workplaceId);
    if (current.includes(id)) return;
    this.workplace.update(workplaceId, { dismissedPatternIds: [...current, id] });
  }

  undismissPattern(workplaceId: WorkplaceId, id: string): void {
    const current = this.dismissedPatternIds(workplaceId);
    if (!current.includes(id)) return;
    this.workplace.update(workplaceId, {
      dismissedPatternIds: current.filter(patternId => patternId !== id),
    });
  }
}
