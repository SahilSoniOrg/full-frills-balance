import { AuditAction } from '@/src/data/models/AuditLog';
import Journal from '@/src/data/models/Journal';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { auditService } from '@/src/services/audit-service';
import { prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { ACTIVE_JOURNAL_STATUSES } from '@/src/utils/journalStatus';

export class LedgerWriteService {
    async createJournal(data: CreateJournalData): Promise<Journal> {
        const prepared = await prepareJournalData(data);

        const journal = await journalRepository.createJournalWithTransactions({
            ...data,
            transactions: prepared.transactions,
            totalAmount: prepared.totalAmount,
            displayType: prepared.displayType,
            calculatedBalances: prepared.calculatedBalances,
        });

        await auditService.log({
            entityType: 'journal',
            entityId: journal.id,
            action: AuditAction.CREATE,
            changes: { description: data.description },
        });

        const activeStatus = !data.status || ACTIVE_JOURNAL_STATUSES.includes(data.status as any);
        if (activeStatus && prepared.accountsToRebuild.size > 0) {
            rebuildQueueService.enqueueMany(prepared.accountsToRebuild, data.journalDate);
        }

        return journal;
    }
}

export const ledgerWriteService = new LedgerWriteService();
