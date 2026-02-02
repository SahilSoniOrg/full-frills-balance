import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { act, renderHook } from '@testing-library/react-native';


// Mock dependencies
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/database/Database', () => ({
    database: {
        write: jest.fn(),
        collections: { get: jest.fn() }
    }
}));

describe('useJournalActions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should delegate createJournal', async () => {
        const { result } = renderHook(() => useJournalActions());
        const data = { description: 'test', currencyCode: 'USD', transactions: [] } as any;

        await act(async () => {
            await result.current.createJournal(data);
        });

        expect(journalRepository.createJournalWithTransactions).toHaveBeenCalledWith(data);
    });

    it('should delegate updateJournal', async () => {
        const { result } = renderHook(() => useJournalActions());
        const data = { description: 'update' } as any;

        await act(async () => {
            await result.current.updateJournal('id1', data);
        });

        expect(journalRepository.updateJournalWithTransactions).toHaveBeenCalledWith('id1', data);
    });

    it('should delegate deleteJournal', async () => {
        const { result } = renderHook(() => useJournalActions());
        const journal = { id: 'id1' } as any;

        await act(async () => {
            await result.current.deleteJournal(journal);
        });

        expect(journalRepository.deleteJournal).toHaveBeenCalledWith('id1');
    });

    it('should delegate duplicateJournal', async () => {
        const { result } = renderHook(() => useJournalActions());

        await act(async () => {
            await result.current.duplicateJournal('id1');
        });

        expect(journalRepository.duplicateJournal).toHaveBeenCalledWith('id1');
    });
});
