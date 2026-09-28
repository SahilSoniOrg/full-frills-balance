import {
  findPostedJournalBalanceSourcePage,
  findPostedJournalBalanceSourcesByIds,
  type JournalBalanceSource,
} from '@/src/data/repositories/journal/journalBalanceLineQueries';
import {
  evaluateJournalBalance,
  resolveCurrencyPrecisions,
  normalizeCurrencyCode,
  type JournalBalanceEvaluation,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { currencyReadService } from '@/src/services/currency-read-service';
import type { JournalId, WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';

const AUDIT_PAGE_SIZE = 100;

export interface UnbalancedJournal {
  journal: JournalBalanceSource;
  evaluation: JournalBalanceEvaluation;
}

export interface JournalBalanceAuditResult {
  journalsChecked: number;
  precisionByCurrency: ReadonlyMap<string, number>;
  unbalanced: UnbalancedJournal[];
}

export function resolveJournalPrecisions(
  journals: readonly JournalBalanceSource[],
  knownPrecisions: ReadonlyMap<string, number> = new Map(),
): Promise<Map<string, number>> {
  return resolveCurrencyPrecisions(
    journals
      .flatMap(journal => [
        journal.currencyCode,
        ...journal.lines.map(line => line.accountCurrency),
      ])
      .filter(code => !knownPrecisions.has(normalizeCurrencyCode(code))),
    code => currencyReadService.getPrecision(code),
  );
}

/**
 * Re-evaluates every posted journal with the balance rule enforced on save and restore.
 * Read-only: journals written before that rule existed are reported, never modified.
 */
export async function findUnbalancedJournals(
  workplaceId: WorkplaceId,
): Promise<JournalBalanceAuditResult> {
  const precisionByCurrency = new Map<string, number>();
  const unbalanced: UnbalancedJournal[] = [];
  let journalsChecked = 0;
  let afterJournalId = '';
  while (true) {
    // Awaiting SQLite/JSI alone only drains microtasks. Give navigation and input
    // a macrotask between bounded reads, including before the first read.
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const { journals, nextJournalId } = await findPostedJournalBalanceSourcePage(
      workplaceId,
      afterJournalId,
      AUDIT_PAGE_SIZE,
    );
    const pagePrecisions = await resolveJournalPrecisions(journals, precisionByCurrency);
    for (const [code, precision] of pagePrecisions) precisionByCurrency.set(code, precision);
    for (const journal of journals) {
      const evaluation = evaluateJournalBalance({
        journalCurrency: journal.currencyCode,
        precisionByCurrency,
        lines: journal.lines,
      });
      if (!evaluation.isBalanced) unbalanced.push({ journal, evaluation });
    }
    journalsChecked += journals.length;
    if (nextJournalId === null) break;
    afterJournalId = nextJournalId;
  }

  logger.info(
    `[JournalBalanceAudit] Checked ${journalsChecked} journals, ${unbalanced.length} unbalanced`,
    { workplaceId },
  );
  return { journalsChecked, precisionByCurrency, unbalanced };
}

/** Rechecks only previously flagged journals so cleared/deleted issues do not linger in cache. */
export async function findUnbalancedJournalsByIds(
  workplaceId: WorkplaceId,
  journalIds: readonly JournalId[],
): Promise<JournalBalanceAuditResult> {
  const precisionByCurrency = new Map<string, number>();
  const unbalanced: UnbalancedJournal[] = [];
  let journalsChecked = 0;
  const uniqueIds = [...new Set(journalIds)];

  for (let offset = 0; offset < uniqueIds.length; offset += AUDIT_PAGE_SIZE) {
    await new Promise<void>(resolve => setTimeout(resolve, 0));
    const journals = await findPostedJournalBalanceSourcesByIds(
      workplaceId,
      uniqueIds.slice(offset, offset + AUDIT_PAGE_SIZE),
    );
    const pagePrecisions = await resolveJournalPrecisions(journals, precisionByCurrency);
    for (const [code, precision] of pagePrecisions) precisionByCurrency.set(code, precision);
    for (const journal of journals) {
      const evaluation = evaluateJournalBalance({
        journalCurrency: journal.currencyCode,
        precisionByCurrency,
        lines: journal.lines,
      });
      if (!evaluation.isBalanced) unbalanced.push({ journal, evaluation });
    }
    journalsChecked += journals.length;
  }

  return { journalsChecked, precisionByCurrency, unbalanced };
}
