import type { WorkplaceId } from '@/src/types/ids';
import type { JournalBalanceEvaluation } from './journalBalanceEvaluator';

export interface PostedJournalFxProposal {
  readonly transactionId: string;
  readonly exchangeRate: number;
  readonly evaluation: JournalBalanceEvaluation;
}

export interface PostedJournalImportIssue {
  readonly journalId: string;
  readonly details: string;
  readonly evaluation: JournalBalanceEvaluation;
  readonly fxProposal?: PostedJournalFxProposal;
}

/** One or more posted journals from an import failed the accounting balance check. */
export class PostedJournalImportError extends Error {
  readonly details: string;

  constructor(
    readonly workplaceId: WorkplaceId,
    readonly issues: readonly PostedJournalImportIssue[],
  ) {
    const firstIssue = issues[0];
    const details =
      issues.length === 1
        ? (firstIssue?.details ?? 'A posted journal entry needs attention.')
        : `${issues.length} posted journal entries need attention.`;
    super(`Restore rejected: ${details}`);
    this.name = 'PostedJournalImportError';
    this.details = details;
  }
}
