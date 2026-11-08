import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { Model } from '@nozbe/watermelondb';
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
  captureMetadata: Map<JournalId, CaptureMetadataMutation>;
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
      captureMetadata: new Map(),
      closed: false,
    };
    sessionStates.set(session, state);

    try {
      const result = await work(session);
      const operations = state.operations.flatMap(operation =>
        typeof operation === 'function' ? operation() : [operation],
      );
      for (const mutation of state.captureMetadata.values()) {
        for (const writer of mutation.writers.values())
          operations.push(
            ...writer.write(withCaptureSources(writer.metadataJson, mutation.sources)),
          );
      }
      if (operations.length > 0) await database.batch(...operations);
      return result;
    } finally {
      state.closed = true;
      sessionStates.delete(session);
    }
  });
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
