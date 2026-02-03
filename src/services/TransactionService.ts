import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { TransactionWithAccountInfo } from '@/src/types/domain';

export class TransactionService {
    /**
     * Gets transactions for a journal with account information.
     * Replaces TransactionRepository.findByJournalWithAccountInfo
     */
    async getTransactionsWithAccountInfo(journalId: string): Promise<TransactionWithAccountInfo[]> {
        return transactionRepository.findByJournalWithAccountInfo(journalId);
    }

    /**
     * Reactive version of getTransactionsWithAccountInfo.
     * Replaces TransactionRepository.observeByJournalWithAccountInfo
     */
    observeTransactionsWithAccountInfo(journalId: string) {
        return transactionRepository.observeByJournalWithAccountInfo(journalId);
    }
}

export const transactionService = new TransactionService();
