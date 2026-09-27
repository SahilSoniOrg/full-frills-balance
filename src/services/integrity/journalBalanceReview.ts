import {
  findPostedJournalBalanceSourcesByIds,
  type JournalBalanceSource,
  type JournalBalanceSourceLine,
} from '@/src/data/repositories/journal/journalBalanceLineQueries';
import {
  normalizeCurrencyCode,
  proposeUniqueJournalFxRate,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import type {
  JournalBalanceLineEdit,
  JournalBalanceReviewEntry,
} from '@/src/domain/accounting/journalBalanceReview';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { sanitizeAmount } from '@/src/utils/validation';
import { resolveJournalPrecisions, type UnbalancedJournal } from './journalBalanceAudit';
import {
  journalBalanceInsightService,
  type JournalBalanceCheckSource,
} from './journalBalanceInsightService';

export type SavedJournalBalanceReviewEntry = JournalBalanceReviewEntry<JournalId>;

/** Saving rounds to each currency's precision, so parsing only needs to keep every digit. */
const MAX_PARSE_PRECISION = 9;

function toReviewEntry(
  { journal, evaluation }: UnbalancedJournal,
  precisionByCurrency: ReadonlyMap<string, number>,
): SavedJournalBalanceReviewEntry {
  const fxProposal = proposeUniqueJournalFxRate({
    journalCurrency: journal.currencyCode,
    precisionByCurrency,
    lines: journal.lines,
  });
  return {
    journalId: journal.journalId,
    description: journal.description,
    journalDate: journal.journalDate,
    currencyCode: journal.currencyCode,
    precisionByCurrency,
    lines: journal.lines.map(line => ({
      id: line.id,
      accountId: line.accountId,
      accountName: line.accountName,
      accountCurrency: line.accountCurrency,
      currency: line.accountCurrency ?? line.currencyCode,
      transactionType: line.transactionType,
      amount: line.amount,
      exchangeRate: line.exchangeRate,
      proposedExchangeRate:
        fxProposal?.transactionId === line.id ? fxProposal.exchangeRate : undefined,
    })),
    details: evaluation.issues.map(issue => issue.message).join('; '),
    evaluation,
    ...(fxProposal ? { fxProposal } : {}),
  };
}

/** Rewrites a journal's lines; the save path rejects posted journals that still do not balance. */
async function rewriteLines(
  workplaceId: WorkplaceId,
  journal: JournalBalanceSource,
  revise: (
    line: JournalBalanceSourceLine,
  ) => Pick<JournalBalanceSourceLine, 'amount' | 'exchangeRate'>,
): Promise<void> {
  const transactions = journal.lines.map(line => ({
    accountId: line.accountId,
    transactionType: line.transactionType,
    notes: line.notes,
    currencyCode: line.currencyCode,
    ...revise(line),
  }));
  await journalPersistenceService.put({ journalId: journal.journalId, transactions }, workplaceId);
}

/** Re-runs the audit and returns every unbalanced journal, newest first. */
export async function loadJournalBalanceReview(
  workplaceId: WorkplaceId,
  source: JournalBalanceCheckSource,
): Promise<SavedJournalBalanceReviewEntry[]> {
  const { unbalanced, precisionByCurrency } = await journalBalanceInsightService.refresh(
    workplaceId,
    source,
  );
  return unbalanced
    .map(entry => toReviewEntry(entry, precisionByCurrency))
    .sort((a, b) => b.journalDate - a.journalDate);
}

/** Saves reviewed amounts and rates for one journal. */
export async function saveJournalBalanceEdits(
  workplaceId: WorkplaceId,
  journalId: JournalId,
  edits: readonly JournalBalanceLineEdit[],
): Promise<void> {
  const [journal] = await findPostedJournalBalanceSourcesByIds(workplaceId, [journalId]);
  if (!journal) throw new Error('This entry is no longer available.');
  const editById = new Map(edits.map(edit => [edit.transactionId, edit]));
  const journalCurrency = normalizeCurrencyCode(journal.currencyCode);

  await rewriteLines(workplaceId, journal, line => {
    const edit = editById.get(line.id);
    if (!edit) throw new Error('Every posting line needs an amount.');
    const crossCurrency = normalizeCurrencyCode(line.accountCurrency) !== journalCurrency;
    return {
      amount: sanitizeAmount(edit.amount, MAX_PARSE_PRECISION) ?? Number.NaN,
      exchangeRate:
        crossCurrency && edit.exchangeRate !== undefined
          ? Number(edit.exchangeRate)
          : line.exchangeRate,
    };
  });
}

/**
 * Applies the implied exchange rate to journals whose single foreign line uniquely determines it,
 * keeping account amounts. Returns how many journals were fixed.
 */
export async function applyJournalBalanceFxSuggestions(
  workplaceId: WorkplaceId,
  journalIds: readonly JournalId[],
): Promise<number> {
  const journals = await findPostedJournalBalanceSourcesByIds(workplaceId, journalIds);
  const precisionByCurrency = await resolveJournalPrecisions(journals);
  let applied = 0;
  for (const journal of journals) {
    const proposal = proposeUniqueJournalFxRate({
      journalCurrency: journal.currencyCode,
      precisionByCurrency,
      lines: journal.lines,
    });
    if (!proposal) continue;
    await rewriteLines(workplaceId, journal, line => ({
      amount: line.amount,
      exchangeRate: line.id === proposal.transactionId ? proposal.exchangeRate : line.exchangeRate,
    }));
    applied++;
  }
  return applied;
}
