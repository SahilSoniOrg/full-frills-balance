import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import AuditLog from '@/src/data/models/AuditLog';
import BalanceSnapshot from '@/src/data/models/BalanceSnapshot';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
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

/** @internal Called by planned-payment persistence after validating typed updates. */
export function stagePlannedPaymentWrite(
  session: AccountingWriteSession,
  operations: readonly PlannedPayment[] | (() => readonly PlannedPayment[]),
): void {
  const state = getOpenState(session);
  if (typeof operations === 'function') state.operations.push(operations);
  else state.operations.push(...operations);
}

/** @internal Called by the budget repository after preparing typed reference rewrites. */
export function stageBudgetMergeWrite(
  session: AccountingWriteSession,
  operations: () => readonly (Budget | BudgetScope)[],
): void {
  getOpenState(session).operations.push(operations);
}

/** @internal Called by the SMS-rule repository after preparing typed reference rewrites. */
export function stageSmsRuleMergeWrite(
  session: AccountingWriteSession,
  operations: () => readonly TransactionAutoPostRule[],
): void {
  getOpenState(session).operations.push(operations);
}

/** @internal Called by the snapshot repository after preparing typed deletions. */
export function stageBalanceSnapshotMergeWrite(
  session: AccountingWriteSession,
  operations: () => readonly BalanceSnapshot[],
): void {
  getOpenState(session).operations.push(operations);
}

export interface AccountMergeWriteOperations {
  accounts: readonly Account[];
  metadata: readonly AccountMetadata[];
  audits: readonly AuditLog[];
}

/** @internal Stages only account-owned merge changes and their audit row. */
export function stageAccountMergeWrite(
  session: AccountingWriteSession,
  operations: () => AccountMergeWriteOperations,
): void {
  getOpenState(session).operations.push(() => {
    const prepared = operations();
    return [...prepared.accounts, ...prepared.metadata, ...prepared.audits];
  });
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
