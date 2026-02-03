import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { journalService } from '@/src/services/JournalService';
import { act, renderHook } from '@testing-library/react-native';

// Mock dependencies
jest.mock('@/src/services/JournalService');
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

    it('should delegate createJournal to journalService', async () => {
        const { result } = renderHook(() => useJournalActions());
        const data = { description: 'test', currencyCode: 'USD', transactions: [] } as any;

        await act(async () => {
            await result.current.createJournal(data);
        });

        expect(journalService.createJournal).toHaveBeenCalledWith(data);
    });

    it('should delegate updateJournal to journalService', async () => {
        const { result } = renderHook(() => useJournalActions());
        const data = { description: 'update' } as any;

        await act(async () => {
            await result.current.updateJournal('id1', data);
        });

        expect(journalService.updateJournal).toHaveBeenCalledWith('id1', data);
    });

    it('should delegate deleteJournal to journalService', async () => {
        const { result } = renderHook(() => useJournalActions());
        const journal = { id: 'id1' } as any;

        await act(async () => {
            await result.current.deleteJournal(journal);
        });

        expect(journalService.deleteJournal).toHaveBeenCalledWith('id1');
    });

    it('should delegate duplicateJournal to journalService', async () => {
        const { result } = renderHook(() => useJournalActions());

        await act(async () => {
            await result.current.duplicateJournal('id1');
        });

        expect(journalService.duplicateJournal).toHaveBeenCalledWith('id1');
    });

    it('should delegate findJournal to journalRepository', async () => {
        const { result } = renderHook(() => useJournalActions());

        await act(async () => {
            await result.current.findJournal('id1');
        });

        expect(journalRepository.find).toHaveBeenCalledWith('id1');
    });
});
