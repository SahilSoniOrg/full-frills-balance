import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import type PersonAccount from '@/src/data/models/PersonAccount';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';
import {
  balanceRebuildIntentRepository,
  balanceRebuildKey,
  type BalanceRebuildRequest,
} from './BalanceRebuildIntentRepository';
import type { CaptureSourceObservation } from '@/src/domain/transaction-intelligence/captureMetadata';
import {
  mergeCaptureSources,
  withCaptureSources,
} from '@/src/domain/transaction-intelligence/captureMetadata';

declare const accountingWriteSessionBrand: unique symbol;

/** Opaque handle for one atomic accounting write across typed repositories. */
export interface AccountingWriteSession {
  readonly [accountingWriteSessionBrand]: true;
}

interface SessionState {
  operations: (Model | (() => readonly Model[]))[];
  createdAccounts: Account[];
  createdPersonAccounts: PersonAccount[];
  captureMetadata: Map<JournalId, CaptureMetadataMutation>;
  rebuildIntents: Map<string, BalanceRebuildRequest>;
  closed: boolean;
}

interface CaptureMetadataMutation {
  workplaceId: WorkplaceId;
  sources: CaptureSourceObservation[];
  writers: Map<
    string,
    {
      metadataJson?: string;
      write: (metadataJson: string | undefined) => readonly Model[];
    }
  >;
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
    const state: SessionState = {
      operations: [],
      createdAccounts: [],
      createdPersonAccounts: [],
      captureMetadata: new Map(),
      rebuildIntents: new Map(),
      closed: false,
    };
    sessionStates.set(session, state);

    try {
      const result = await work(session);
      const prepareIntents = state.rebuildIntents.size
        ? await balanceRebuildIntentRepository.prepareUpserts([...state.rebuildIntents.values()])
        : undefined;
      const operations = state.operations.flatMap(operation =>
        typeof operation === 'function' ? operation() : [operation],
      );
      for (const mutation of state.captureMetadata.values()) {
        for (const writer of mutation.writers.values())
          operations.push(
            ...writer.write(withCaptureSources(writer.metadataJson, mutation.sources)),
          );
      }
      if (prepareIntents) operations.push(...prepareIntents());
      if (operations.length) await database.batch(...operations);
      return result;
    } finally {
      state.closed = true;
      sessionStates.delete(session);
    }
  });
}

/** Stage durable projection work in the same batch as the accounting mutation. */
export function stageBalanceRebuildIntents(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  accountIds: Iterable<AccountId>,
  fromDate: number,
): void {
  const state = getOpenState(session);
  for (const accountId of accountIds) {
    const key = balanceRebuildKey(workplaceId, accountId);
    const current = state.rebuildIntents.get(key);
    if (!current || fromDate < current.fromDate)
      state.rebuildIntents.set(key, { workplaceId, accountId, fromDate });
  }
}

function captureMutationFor(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  journalId: JournalId,
): CaptureMetadataMutation {
  const state = getOpenState(session);
  let mutation = state.captureMetadata.get(journalId);
  if (!mutation) {
    mutation = { workplaceId, sources: [], writers: new Map() };
    state.captureMetadata.set(journalId, mutation);
  }
  if (mutation.workplaceId !== workplaceId)
    throw new Error('Journal capture metadata Workplace mismatch');
  return mutation;
}

/** The accounting session owns one source accumulator and metadata writer set per journal. */
export function addJournalCaptureSources(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  journalId: JournalId,
  sources: readonly CaptureSourceObservation[],
): void {
  const mutation = captureMutationFor(session, workplaceId, journalId);
  mutation.sources = mergeCaptureSources(mutation.sources, sources);
}

export function hasJournalCaptureMetadataWrite(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  journalId: JournalId,
): boolean {
  const mutation = getOpenState(session).captureMetadata.get(journalId);
  if (!mutation) return false;
  if (mutation.workplaceId !== workplaceId)
    throw new Error('Journal capture metadata Workplace mismatch');
  return mutation.writers.size > 0;
}

export function stageJournalCaptureMetadataWrite(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
  journalId: JournalId,
  writerKey: string,
  metadataJson: string | undefined,
  writer: (metadataJson: string | undefined) => readonly Model[],
): void {
  captureMutationFor(session, workplaceId, journalId).writers.set(writerKey, {
    metadataJson,
    write: writer,
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

/** @internal Tracks not-yet-committed PersonAccount links staged in this session. */
export function stagePersonAccountCreation(
  session: AccountingWriteSession,
  link: PersonAccount,
  operations: readonly Model[],
): void {
  const state = getOpenState(session);
  if (state.createdPersonAccounts.some(created => created.accountId === link.accountId)) {
    throw new Error(`Account ${link.accountId} was already staged for a person in this session`);
  }
  state.createdPersonAccounts.push(link);
  state.operations.push(...operations);
}

/** @internal Includes not-yet-committed PersonAccount links during journal integrity sync. */
export function getStagedPersonAccounts(
  session: AccountingWriteSession,
  workplaceId: WorkplaceId,
): readonly PersonAccount[] {
  return getOpenState(session).createdPersonAccounts.filter(
    link => link.workplaceId === workplaceId,
  );
}
