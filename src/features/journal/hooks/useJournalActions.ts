import Journal from '@/src/data/models/Journal';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';

export function useJournalActions() {
    /**
     * Create a new journal entry with transactions
     */
    const createJournal = async (data: CreateJournalData) => {
        return journalRepository.createJournalWithTransactions(data);
    };

    /**
     * Delete a journal entry and its transactions
     */
    const deleteJournal = async (journal: Journal) => {
        return journalRepository.delete(journal);
    };

    /**
     * Find a journal by ID
     */
    const findJournal = async (journalId: string) => {
        return journalRepository.find(journalId);
    };

    return {
        createJournal,
        deleteJournal,
        findJournal,
    };
}
