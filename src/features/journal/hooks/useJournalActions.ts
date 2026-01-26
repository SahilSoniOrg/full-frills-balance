import Journal from '@/src/data/models/Journal';
import { CreateJournalData, journalRepository } from '@/src/data/repositories/JournalRepository';
import { useCallback } from 'react';

export function useJournalActions() {
    const createJournal = useCallback(async (data: CreateJournalData) => {
        return journalRepository.createJournalWithTransactions(data);
    }, []);

    const deleteJournal = useCallback(async (journal: Journal) => {
        return journalRepository.delete(journal);
    }, []);

    const findJournal = useCallback(async (journalId: string) => {
        return journalRepository.find(journalId);
    }, []);

    return {
        createJournal,
        deleteJournal,
        findJournal,
    };
}
