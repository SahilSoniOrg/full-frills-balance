import Journal from '@/src/data/models/Journal';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import {
  CreateJournalData,
  journalWriteRepository,
} from '@/src/data/repositories/journal/journalWriteModule';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import {
  AccountId,
  AuditAction,
  JournalId,
  WorkplaceId,
  mapTransactionToAudit,
} from '@/src/types/domain';
import { prepareJournalData } from './prepareJournalData';

export class LedgerUpdateService {
  async updateJournal(
    journalId: JournalId,
    data: CreateJournalData,
    workplaceId: WorkplaceId,
  ): Promise<Journal> {
    const originalJournal = await journalQueryRepository.find(workplaceId, journalId);
    if (!originalJournal) throw new Error('Journal not found');

    const originalTransactions = await transactionQueryRepository.findByJournal(
      workplaceId,
      journalId,
    );
    const prepared = await prepareJournalData(data, workplaceId);

    const extraOpCreator = () => {
      const mappedBeforeTransactions = originalTransactions.map(t => mapTransactionToAudit(t));
      const mappedAfterTransactions = data.transactions.map(t => mapTransactionToAudit(t));
      return auditRepository.prepareLog(
        {
          entityType: 'journal',
          entityId: journalId,
          action: AuditAction.UPDATE,
          changes: {
            before: {
              description: originalJournal.description,
              journalDate: originalJournal.journalDate,
              currencyCode: originalJournal.currencyCode,
              status: originalJournal.status,
              totalAmount: originalJournal.totalAmount,
              transactions: mappedBeforeTransactions,
            },
            after: {
              description: data.description,
              journalDate: data.journalDate,
              transactions: mappedAfterTransactions,
            },
          },
        },
        workplaceId,
      );
    };

    const originalAccountIds = new Set(originalTransactions.map(t => t.accountId));
    const allAccountsToRebuild = new Set<AccountId>([
      ...prepared.accountsToRebuild,
      ...originalAccountIds,
    ]);
    const rebuildFromDate = Math.min(originalJournal.journalDate, data.journalDate);

    return journalWriteRepository.updateJournalWithTransactions(
      workplaceId,
      journalId,
      {
        ...data,
        transactions: prepared.transactions,
        totalAmount: prepared.totalAmount,
        displayType: prepared.displayType,
        calculatedBalances: prepared.calculatedBalances,
        metadata: data.metadata,
      },
      extraOpCreator,
      () => {
        rebuildQueueService.enqueueMany(allAccountsToRebuild, rebuildFromDate, workplaceId);
      },
    );
  }
}

export const ledgerUpdateService = new LedgerUpdateService();
