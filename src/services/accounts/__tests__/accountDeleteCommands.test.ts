import { formatAccountDeleteBlockersError } from '@/src/services/accounts/accountDeleteCommands';
import type { DeleteBlocker } from '@/src/services/accounts/accountReferenceGraph';

describe('formatAccountDeleteBlockersError', () => {
  it('formats structured blockers into the user-facing delete Error', () => {
    const blockers: DeleteBlocker[] = [
      { code: 'transactions', count: 2, label: 'transaction(s)' },
      { code: 'budget_scopes', count: 1, label: 'budget scope(s)' },
    ];

    expect(formatAccountDeleteBlockersError('Checking', blockers)).toEqual(
      new Error(
        'Account "Checking" cannot be deleted while referenced by 2 transaction(s), 1 budget scope(s). ' +
          'Remove or retarget those references first (or merge into another account).',
      ),
    );
  });
});
