import type { AccountRole } from '@/src/types/domainJournal';
import type { AccountId } from '@/src/types/ids';

const JOURNAL_ENTRY_ROUTE_NAME = 'journal-entry';

/** The journal-entry slot that should receive an account created from the picker. */
export type AccountCreationReturnTarget =
  { kind: 'line'; lineId: string } | { kind: 'batchRow'; rowId: string; role: AccountRole };

/** Params the account form sets on the journal-entry route after creating an account. */
export type AccountCreationResultParams = {
  createdAccountId?: string;
  createdAccountTarget?: string;
};

type AccountCreationReturnNavigation = {
  getState: () => { index: number; routes: readonly { key: string; name: string }[] } | undefined;
  dispatch: (action: {
    type: 'SET_PARAMS';
    payload: { params: AccountCreationResultParams };
    source: string;
  }) => void;
};

const BATCH_ROW_PREFIX: Record<AccountRole, string> = {
  source: 'source-row',
  destination: 'destination-row',
};

export function encodeAccountCreationReturnTarget(target: AccountCreationReturnTarget): string {
  return target.kind === 'line'
    ? `line:${target.lineId}`
    : `${BATCH_ROW_PREFIX[target.role]}:${target.rowId}`;
}

export function decodeAccountCreationReturnTarget(
  value: string | undefined,
): AccountCreationReturnTarget | undefined {
  if (!value) return undefined;
  const separator = value.indexOf(':');
  if (separator <= 0) return undefined;

  const prefix = value.slice(0, separator);
  const id = value.slice(separator + 1);
  if (!id) return undefined;

  if (prefix === 'line') return { kind: 'line', lineId: id };
  if (prefix === BATCH_ROW_PREFIX.source) return { kind: 'batchRow', rowId: id, role: 'source' };
  if (prefix === BATCH_ROW_PREFIX.destination) {
    return { kind: 'batchRow', rowId: id, role: 'destination' };
  }
  return undefined;
}

/**
 * Hands a created account back to the journal entry beneath the account form.
 * Returns false when there is no valid target or the journal entry screen is gone.
 */
export function returnCreatedAccountToJournalEntry(
  navigation: AccountCreationReturnNavigation,
  encodedTarget: string | undefined,
  accountId: AccountId,
): boolean {
  if (!encodedTarget || !decodeAccountCreationReturnTarget(encodedTarget)) return false;

  const state = navigation.getState();
  const journalEntryRoute = state?.routes
    .slice(0, state.index)
    .reverse()
    .find(route => route.name === JOURNAL_ENTRY_ROUTE_NAME);
  if (!journalEntryRoute) return false;

  navigation.dispatch({
    type: 'SET_PARAMS',
    payload: { params: { createdAccountId: accountId, createdAccountTarget: encodedTarget } },
    source: journalEntryRoute.key,
  });
  return true;
}
