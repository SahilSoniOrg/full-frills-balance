import { asAccountId } from '@/src/types/ids';
import {
  decodeAccountCreationReturnTarget,
  encodeAccountCreationReturnTarget,
  returnCreatedAccountToJournalEntry,
} from '@/src/utils/accountCreationReturn';

function createNavigation(routes: { key: string; name: string }[], index = routes.length - 1) {
  return {
    getState: jest.fn(() => ({ index, routes })),
    dispatch: jest.fn(),
  };
}

describe('accountCreationReturn', () => {
  it.each([
    { kind: 'line', lineId: 'line-1' },
    { kind: 'line', lineId: 'id:with:colons' },
    { kind: 'batchRow', rowId: 'row-1', role: 'source' },
    { kind: 'batchRow', rowId: 'row-2', role: 'destination' },
  ] as const)('round-trips the %o return target through the route param', target => {
    expect(decodeAccountCreationReturnTarget(encodeAccountCreationReturnTarget(target))).toEqual(
      target,
    );
  });

  it.each([undefined, '', 'line:', ':line-1', 'unknown:line-1', 'line-1'])(
    'rejects the malformed return target %p',
    value => {
      expect(decodeAccountCreationReturnTarget(value)).toBeUndefined();
    },
  );

  it('sets the created account on the journal entry beneath the account form', () => {
    const navigation = createNavigation([
      { key: 'tabs-1', name: '(tabs)' },
      { key: 'journal-older', name: 'journal-entry' },
      { key: 'details-1', name: 'journal-details' },
      { key: 'journal-1', name: 'journal-entry' },
      { key: 'account-form-1', name: 'account-creation' },
    ]);
    const target = encodeAccountCreationReturnTarget({ kind: 'line', lineId: 'line-1' });

    expect(returnCreatedAccountToJournalEntry(navigation, target, asAccountId('new-account'))).toBe(
      true,
    );

    expect(navigation.dispatch).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).toHaveBeenCalledWith({
      type: 'SET_PARAMS',
      payload: { params: { createdAccountId: 'new-account', createdAccountTarget: target } },
      source: 'journal-1',
    });
  });

  it('does nothing when the journal entry screen is gone', () => {
    const navigation = createNavigation([
      { key: 'tabs-1', name: '(tabs)' },
      { key: 'account-form-1', name: 'account-creation' },
    ]);

    expect(
      returnCreatedAccountToJournalEntry(
        navigation,
        encodeAccountCreationReturnTarget({ kind: 'line', lineId: 'line-1' }),
        asAccountId('new-account'),
      ),
    ).toBe(false);
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('does nothing without a return target', () => {
    const navigation = createNavigation([
      { key: 'journal-1', name: 'journal-entry' },
      { key: 'account-form-1', name: 'account-creation' },
    ]);

    expect(returnCreatedAccountToJournalEntry(navigation, undefined, asAccountId('a'))).toBe(false);
    expect(returnCreatedAccountToJournalEntry(navigation, 'garbage', asAccountId('a'))).toBe(false);
    expect(navigation.getState).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });
});
