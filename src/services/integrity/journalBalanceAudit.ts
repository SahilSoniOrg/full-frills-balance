import {
  findPostedJournalBalanceSources,
  type JournalBalanceSource,
} from '@/src/data/repositories/journal/journalBalanceLineQueries';
import {
  evaluateJournalBalance,
  resolveCurrencyPrecisions,
  type JournalBalanceEvaluation,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { currencyReadService } from '@/src/services/currency-read-service';
import type { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';

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
): Promise<Map<string, number>> {
  return resolveCurrencyPrecisions(
    journals.flatMap(journal => [
      journal.currencyCode,
      ...journal.lines.map(line => line.accountCurrency),
    ]),
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
  const journals = await findPostedJournalBalanceSources(workplaceId);
  const precisionByCurrency = await resolveJournalPrecisions(journals);

  const unbalanced: UnbalancedJournal[] = [];
  for (const journal of journals) {
    const evaluation = evaluateJournalBalance({
      journalCurrency: journal.currencyCode,
      precisionByCurrency,
      lines: journal.lines,
    });
    if (!evaluation.isBalanced) unbalanced.push({ journal, evaluation });
  }

  logger.info(
    `[JournalBalanceAudit] Checked ${journals.length} journals, ${unbalanced.length} unbalanced`,
    { workplaceId },
  );
  return { journalsChecked: journals.length, precisionByCurrency, unbalanced };
}
