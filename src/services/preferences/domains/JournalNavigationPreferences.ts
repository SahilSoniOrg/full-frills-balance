import { AccountId } from '@/src/types/ids';
import type { DevicePreferencesStore } from '../DevicePreferencesStore';
import type { WorkplacePreferencesStore } from '../WorkplacePreferencesStore';

/** Last-used journal account ids — workplace bag. */
export class JournalNavigationPreferences {
  constructor(
    private readonly workplace: WorkplacePreferencesStore,
    private readonly device: DevicePreferencesStore,
  ) {}

  get lastUsedSourceAccountId(): AccountId | undefined {
    return this.snapshot()?.lastUsedSourceAccountId;
  }

  setLastUsedSourceAccountId(accountId: AccountId | undefined): void {
    const workplaceId = this.device.activeWorkplaceId;
    if (!workplaceId) return;
    this.workplace.update(workplaceId, { lastUsedSourceAccountId: accountId });
  }

  get lastUsedDestinationAccountId(): AccountId | undefined {
    return this.snapshot()?.lastUsedDestinationAccountId;
  }

  setLastUsedDestinationAccountId(accountId: AccountId | undefined): void {
    const workplaceId = this.device.activeWorkplaceId;
    if (!workplaceId) return;
    this.workplace.update(workplaceId, { lastUsedDestinationAccountId: accountId });
  }

  private snapshot() {
    const workplaceId = this.device.activeWorkplaceId;
    return workplaceId ? this.workplace.getSnapshot(workplaceId) : undefined;
  }
}
