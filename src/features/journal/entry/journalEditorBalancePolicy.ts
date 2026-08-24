import { JournalCalculator } from '@/src/services/accounting/JournalCalculator';
import {
  isJournalEditorEntryReady,
  mapEditorLinesForBalanceCheck,
} from '@/src/services/journal/journalEditorHelpers';
import { JournalEntryLine } from '@/src/types/domainJournal';

export interface JournalEditorBalanceState {
  imbalance: ReturnType<typeof JournalCalculator.calculateImbalance>;
  isUnbalanced: boolean;
  isEntryReadyToBalance: boolean;
}

/**
 * Pure balance / readiness policy shared by journal editor hooks (commit 45).
 */
export function deriveJournalEditorBalanceState(
  lines: JournalEntryLine[],
  workplaceCurrency: string,
): JournalEditorBalanceState {
  const journalLinesForBalance = mapEditorLinesForBalanceCheck(lines, workplaceCurrency);
  const imbalance = JournalCalculator.calculateImbalance(journalLinesForBalance, workplaceCurrency);
  const isUnbalanced = !JournalCalculator.isBalanced(journalLinesForBalance, workplaceCurrency);
  const isEntryReadyToBalance = isJournalEditorEntryReady(lines, workplaceCurrency);

  return { imbalance, isUnbalanced, isEntryReadyToBalance };
}
