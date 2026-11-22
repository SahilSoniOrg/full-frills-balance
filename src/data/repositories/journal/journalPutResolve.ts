import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import {
  fetchJournalTransactions,
  findActiveJournal,
  toPersistenceLine,
} from '@/src/data/repositories/journal/journalPersistenceSupport';
import type { PutJournalRequest } from '@/src/data/repositories/journal/journalPersistenceTypes';
import type { JournalWriteLine } from '@/src/types/journalWrite';
import { JournalBalanceError } from '@/src/domain/accounting/journalBalanceEvaluator';
import { JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';

/** Persisted journal values a put resolves to, whether it creates or updates. */
export interface ResolvedPut {
  existing: Journal | null;
  oldTransactions: readonly Transaction[];
  lines: readonly JournalWriteLine[];
  replacesLines: boolean;
  journalDate: number;
  description?: string;
  notes?: string;
  displayType?: JournalDisplayType;
  currencyCode: string;
  status: JournalStatus;
}

export function resolveCreate(input: PutJournalRequest): ResolvedPut {
  if (!input.transactions || input.journalDate === undefined || !input.currencyCode) {
    throw new Error('A new journal requires a date, currency, and transaction lines');
  }
  return {
    existing: null,
    oldTransactions: [],
    lines: input.transactions,
    replacesLines: true,
    journalDate: input.journalDate,
    description: input.description,
    notes: input.notes,
    displayType: input.displayType,
    currencyCode: input.currencyCode,
    status: input.status ?? JournalStatus.POSTED,
  };
}

/** Sparse update: omitted fields keep persisted values; an explicit `undefined` text clears it. */
export function resolveUpdate(
  input: PutJournalRequest,
  existing: Journal,
  oldTransactions: readonly Transaction[],
): ResolvedPut {
  if (
    input.currencyCode !== undefined &&
    input.currencyCode.trim().toUpperCase() !== existing.currencyCode.trim().toUpperCase()
  ) {
    throw new JournalBalanceError('A saved journal currency cannot be changed');
  }
  return {
    existing,
    oldTransactions,
    lines: input.transactions ?? oldTransactions.map(toPersistenceLine),
    replacesLines: input.transactions !== undefined,
    journalDate: input.journalDate ?? existing.journalDate,
    description: 'description' in input ? input.description : existing.description,
    notes: 'notes' in input ? input.notes : existing.notes,
    displayType: input.displayType ?? (input.transactions ? undefined : existing.displayType),
    currencyCode: existing.currencyCode,
    status: input.status ?? existing.status,
  };
}

/** Resolves a put to either a create or a sparse update of the active journal. */
export async function resolvePut(
  input: PutJournalRequest,
  workplaceId: WorkplaceId,
): Promise<ResolvedPut> {
  if (!input.journalId) return resolveCreate(input);
  const existing = await findActiveJournal(input.journalId, workplaceId);
  if (!existing) throw new Error('Journal not found');
  const oldTransactions = await fetchJournalTransactions(workplaceId, [existing.id]);
  return resolveUpdate(input, existing, oldTransactions);
}
