import { AuditAction } from '@/src/data/models/AuditLog';
import Journal from '@/src/data/models/Journal';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { auditService } from '@/src/services/audit-service';
import { prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';

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

        if (prepared.accountsToRebuild.size > 0) {
            rebuildQueueService.enqueueMany(prepared.accountsToRebuild, data.journalDate);
        }

        return journal;
    }
}

export const ledgerWriteService = new LedgerWriteService();
