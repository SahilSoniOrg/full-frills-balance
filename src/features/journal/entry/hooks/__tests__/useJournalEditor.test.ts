import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { journalEntryService } from '@/src/services/journal-entry-service';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';

// Mock dependencies
jest.mock('@/src/services/journal-entry-service');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('expo-router', () => ({
    useRouter: jest.fn()
}));
jest.mock('@/src/utils/alerts', () => ({
    showErrorAlert: jest.fn()
}));

const mockBack = jest.fn();
(useRouter as jest.Mock).mockReturnValue({ back: mockBack });

describe('useJournalEditor', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (useRouter as jest.Mock).mockReturnValue({ back: mockBack });
    });

    it('should initialize with default lines', () => {
        const { result } = renderHook(() => useJournalEditor());

        expect(result.current.lines).toHaveLength(2);
        expect(result.current.isGuidedMode).toBe(true);
        expect(result.current.transactionType).toBe('expense');
    });

    it('should add lines', () => {
        const { result } = renderHook(() => useJournalEditor());

        act(() => {
            result.current.addLine();
        });

        expect(result.current.lines).toHaveLength(3);
    });

    it('should remove lines but keep minimum 2', () => {
        const { result } = renderHook(() => useJournalEditor());

        act(() => {
            result.current.removeLine(result.current.lines[0].id);
        });

        expect(result.current.lines).toHaveLength(2); // Should not go below 2

        act(() => {
            result.current.addLine(); // Now 3
            result.current.removeLine(result.current.lines[0].id);
        });

        expect(result.current.lines).toHaveLength(2);
    });

    it('should fail submission if service fails', async () => {
        const { result } = renderHook(() => useJournalEditor());

        (journalEntryService.submitJournalEntry as jest.Mock).mockResolvedValue({ success: false, error: 'fail' });

        await act(async () => {
            await result.current.submit();
        });

        expect(journalEntryService.submitJournalEntry).toHaveBeenCalled();
        expect(mockBack).not.toHaveBeenCalled();
    });

    it('should succeed submission and navigate back', async () => {
        const { result } = renderHook(() => useJournalEditor());

        (journalEntryService.submitJournalEntry as jest.Mock).mockResolvedValue({ success: true });

        await act(async () => {
            await result.current.submit();
        });

        expect(mockBack).toHaveBeenCalled();
    });

    it('should load journal data on edit', async () => {
        const mockJournal = {
            journalDate: '2024-01-01T12:00:00.000Z',
            description: 'Test Load'
        };
        const mockTxs = [
            { id: '1', accountId: 'a1', amount: 10 },
            { id: '2', accountId: 'a2', amount: 10 }
        ];

        (journalRepository.find as jest.Mock).mockResolvedValue(mockJournal);
        (transactionRepository.findEnrichedByJournal as jest.Mock).mockResolvedValue(mockTxs);

        const { result } = renderHook(() => useJournalEditor({ journalId: 'j1' }));

        expect(result.current.isLoading).toBe(true);

        await waitFor(() => expect(result.current.isLoading).toBe(false));

        expect(result.current.description).toBe('Test Load');
        expect(result.current.lines).toHaveLength(2);
    });
});
