import type { AccountId, WorkplaceId } from '@/src/types/ids';
import { unionSuppressions, type AccountMatcherSuppression } from '../workplaceTypes';
import type { WorkplacePreferencesStore } from '../WorkplacePreferencesStore';

/** Persistent matcher dismissals and forget actions, scoped to one Workplace. */
export class AccountMatcherPreferences {
  constructor(private readonly workplace: WorkplacePreferencesStore) {}

  list(workplaceId: WorkplaceId, accountId?: AccountId): AccountMatcherSuppression[] {
    const suppressions = this.workplace.getSnapshot(workplaceId).accountMatcherSuppressions ?? [];
    return accountId
      ? suppressions.filter(suppression => suppression.accountId === accountId)
      : suppressions;
  }

  dismiss(workplaceId: WorkplaceId, accountId: AccountId, conditionsKey: string): void {
    this.put(workplaceId, { accountId, conditionsKey, reason: 'dismissed' });
  }

  forget(workplaceId: WorkplaceId, accountId: AccountId, conditionsKey: string): void {
    this.put(workplaceId, { accountId, conditionsKey, reason: 'forgotten' });
  }

  restore(workplaceId: WorkplaceId, accountId: AccountId, conditionsKey: string): void {
    const current = this.list(workplaceId);
    const next = current.filter(
      item => item.accountId !== accountId || item.conditionsKey !== conditionsKey,
    );
    if (next.length !== current.length) {
      this.workplace.update(workplaceId, { accountMatcherSuppressions: next });
    }
  }

  /** Idempotently moves source suppressions onto the surviving Account after merge commit. */
  remapAccounts(
    workplaceId: WorkplaceId,
    sourceIds: readonly AccountId[],
    targetId: AccountId,
  ): void {
    if (sourceIds.length === 0) return;
    const sourceSet = new Set(sourceIds);
    const current = this.list(workplaceId);
    const remapped = current.map(suppression =>
      sourceSet.has(suppression.accountId) ? { ...suppression, accountId: targetId } : suppression,
    );
    const union = unionSuppressions(remapped);
    if (JSON.stringify(union) !== JSON.stringify(current)) {
      this.workplace.update(workplaceId, { accountMatcherSuppressions: union });
    }
  }

  private put(workplaceId: WorkplaceId, suppression: AccountMatcherSuppression): void {
    const next = unionSuppressions([...this.list(workplaceId), suppression]);
    this.workplace.update(workplaceId, { accountMatcherSuppressions: next });
  }
}
