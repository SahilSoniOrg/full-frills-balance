import { toPlainJournal } from '@/src/data/models/Journal';
import { accountQueryRepository } from '@/src/data/repositories/account';
import {
  journalObserveQueries,
  journalQueryRepository,
} from '@/src/data/repositories/journal/journalTimelineModule';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import {
  JournalEditorEnrichedLine,
  mapEnrichedLinesToEditorState,
} from '@/src/services/journal/journalEditorHelpers';
import { JournalEntryLine, TabType } from '@/src/types/domainJournal';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import { PlainJournal } from '@/src/types/plainDtos';
import { map, Observable } from 'rxjs';

export interface JournalEditorLoadData {
  journal: PlainJournal;
  lines: JournalEntryLine[];
  transactionType?: TabType;
  forceAdvancedMode: boolean;
}

/** Read boundary for journal feature consumers. */
export class JournalReadService {
  observeById(
    workplaceId: WorkplaceId,
    journalId: string,
    includeDeleted: boolean = false,
  ): Observable<PlainJournal | null> {
    return journalObserveQueries
      .observeById(workplaceId, journalId, includeDeleted)
      .pipe(map(journal => (journal ? toPlainJournal(journal) : null)));
  }

  async find(workplaceId: WorkplaceId, journalId: JournalId): Promise<PlainJournal | null> {
    const journal = await journalQueryRepository.find(workplaceId, journalId);
    return journal ? toPlainJournal(journal) : null;
  }

  /**
   * Loads journal, transaction legs, and account metadata in parallel for fast editor hydration.
   */
  async getJournalForEditor(
    workplaceId: WorkplaceId,
    journalId: JournalId,
  ): Promise<JournalEditorLoadData | null> {
    const [journalRecord, transactions] = await Promise.all([
      journalQueryRepository.find(workplaceId, journalId),
      transactionQueryRepository.findByJournal(workplaceId, journalId),
    ]);

    if (!journalRecord) return null;

    const accountIds = Array.from(new Set(transactions.map(t => t.accountId)));
    const accounts =
      accountIds.length > 0
        ? await accountQueryRepository.findAllByIds(workplaceId, accountIds)
        : [];
    const accountMap = new Map(accounts.map(a => [a.id, a]));

    const enrichedLines: JournalEditorEnrichedLine[] = transactions.map(tx => {
      const account = accountMap.get(tx.accountId);
      return {
        id: tx.id,
        accountId: tx.accountId,
        accountName: account?.name || '',
        accountType: account?.accountType,
        amount: tx.amount,
        transactionType: tx.transactionType,
        notes: tx.notes,
        exchangeRate: tx.exchangeRate,
        currencyCode: tx.currencyCode,
      };
    });

    const { lines, forceAdvancedMode, simpleTabType } =
      mapEnrichedLinesToEditorState(enrichedLines);

    return {
      journal: toPlainJournal(journalRecord),
      lines,
      transactionType: simpleTabType,
      forceAdvancedMode,
    };
  }
}

export const journalReadService = new JournalReadService();
