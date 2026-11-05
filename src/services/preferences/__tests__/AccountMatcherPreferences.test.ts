import { preferences } from '@/src/services/preferences';
import type { AccountId, WorkplaceId } from '@/src/types/ids';

const WORKPLACE_ID = 'matcher-preferences-wp' as WorkplaceId;
const SOURCE_ID = 'matcher-source' as AccountId;
const TARGET_ID = 'matcher-target' as AccountId;

describe('AccountMatcherPreferences', () => {
  beforeEach(() => preferences.workplace.clear(WORKPLACE_ID));
  afterEach(() => preferences.workplace.clear(WORKPLACE_ID));

  it('stores dismissed and forgotten states, and restores a suppression', () => {
    preferences.accountMatchers.dismiss(WORKPLACE_ID, TARGET_ID, 'key-1');
    expect(preferences.accountMatchers.list(WORKPLACE_ID, TARGET_ID)).toEqual([
      { accountId: TARGET_ID, conditionsKey: 'key-1', reason: 'dismissed' },
    ]);

    preferences.accountMatchers.forget(WORKPLACE_ID, TARGET_ID, 'key-1');
    expect(preferences.accountMatchers.list(WORKPLACE_ID)[0].reason).toBe('forgotten');
    preferences.accountMatchers.restore(WORKPLACE_ID, TARGET_ID, 'key-1');
    expect(preferences.accountMatchers.list(WORKPLACE_ID)).toEqual([]);
  });

  it('unions source suppressions onto target idempotently', () => {
    preferences.accountMatchers.dismiss(WORKPLACE_ID, SOURCE_ID, 'source-key');
    preferences.accountMatchers.forget(WORKPLACE_ID, TARGET_ID, 'target-key');

    preferences.accountMatchers.remapAccounts(WORKPLACE_ID, [SOURCE_ID], TARGET_ID);
    const firstResult = preferences.accountMatchers.list(WORKPLACE_ID);
    preferences.accountMatchers.remapAccounts(WORKPLACE_ID, [SOURCE_ID], TARGET_ID);

    expect(preferences.accountMatchers.list(WORKPLACE_ID)).toEqual(firstResult);
    expect(firstResult).toEqual([
      { accountId: TARGET_ID, conditionsKey: 'source-key', reason: 'dismissed' },
      { accountId: TARGET_ID, conditionsKey: 'target-key', reason: 'forgotten' },
    ]);
  });
});
