import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { Model } from '@nozbe/watermelondb';

declare const accountingWriteSessionBrand: unique symbol;

/** Opaque handle for one atomic accounting write across typed repositories. */
export interface AccountingWriteSession {
  readonly [accountingWriteSessionBrand]: true;
}

interface SessionState {
  operations: (Model | (() => readonly Model[]))[];
  createdAccounts: Account[];
  closed: boolean;
}

const sessionStates = new WeakMap<AccountingWriteSession, SessionState>();

function getOpenState(session: AccountingWriteSession): SessionState {
  const state = sessionStates.get(session);
  if (!state || state.closed) {
    throw new Error('Accounting write session is not active');
  }
  return state;
}

/**
 * Runs typed repository operations in one WatermelonDB writer. Repositories stage
 * deferred model-operation factories so preparation happens synchronously just
 * before the single batch. If the callback rejects, no model updates are prepared.
 */
export async function runAccountingWriteSession<T>(
  work: (session: AccountingWriteSession) => Promise<T>,
): Promise<T> {
  return database.write(async () => {
    const session = Object.freeze({}) as AccountingWriteSession;
    const state: SessionState = { operations: [], createdAccounts: [], closed: false };
    sessionStates.set(session, state);

    try {
      const result = await work(session);
      if (state.operations.length > 0) {
        const operations = state.operations.flatMap(operation =>
          typeof operation === 'function' ? operation() : [operation],
        );
        if (operations.length > 0) await database.batch(...operations);
      }
      return result;
    } finally {
      state.closed = true;
      sessionStates.delete(session);
    }
  });
}

/** @internal Called by account persistence after preparing account rows. */
export function stageAccountCreation(
  session: AccountingWriteSession,
  account: Account,
  operations: readonly Model[],
): void {
  const state = getOpenState(session);
  if (state.createdAccounts.some(created => created.id === account.id)) {
    throw new Error(`Account ${account.id} was staged more than once`);
  }
  state.createdAccounts.push(account);
  state.operations.push(...operations);
}

/** @internal Stages model operations for synchronous preparation at session flush. */
export function stageModelWrite(
  session: AccountingWriteSession,
  operations: readonly Model[] | (() => readonly Model[]),
): void {
  const state = getOpenState(session);
  if (typeof operations === 'function') state.operations.push(operations);
  else state.operations.push(...operations);
}

/** @internal Includes not-yet-committed accounts when validating a journal. */
export function getStagedAccounts(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  accountIds?: ReadonlySet<AccountId>,
): readonly Account[] {
  return getOpenState(session).createdAccounts.filter(
    account => account.workplaceId === workplaceId && (!accountIds || accountIds.has(account.id)),
  );
}
