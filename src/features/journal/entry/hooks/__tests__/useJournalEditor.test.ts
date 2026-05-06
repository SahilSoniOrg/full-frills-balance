import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { journalService } from '@/src/features/journal/services/JournalService';
import { transactionService } from '@/src/features/journal/services/TransactionService';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { JournalId, WorkplaceId } from '@/src/types/domain';

// Mock dependencies
jest.mock('@/src/features/journal/services/JournalService');
jest.mock('@/src/features/journal/services/TransactionService');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));
jest.mock('@/src/utils/alerts', () => ({
  showErrorAlert: jest.fn(),
}));

const mockBack = jest.fn();
(useRouter as jest.Mock).mockReturnValue({ back: mockBack });

// Mock useUI
jest.mock('@/src/contexts/UIContext', () => ({
  useUI: jest.fn(() => ({
    advancedMode: false,
    setAdvancedMode: jest.fn(),
  })),
}));

// Mock useExchangeRate
jest.mock('@/src/hooks/useExchangeRate', () => ({
  useExchangeRate: jest.fn(() => ({
    fetchRate: jest.fn(),
  })),
}));

describe('useJournalEditor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (useRouter as jest.Mock).mockReturnValue({ back: mockBack });
  });

  it('should initialize with default lines', () => {
    const { result } = renderHook(() => useJournalEditor('test-workplace' as WorkplaceId));

    expect(result.current.lines).toHaveLength(2);
    expect(result.current.isGuidedMode).toBe(true);
    expect(result.current.transactionType).toBe('expense');
  });

  it('should initialize with initialNotes', () => {
    const { result } = renderHook(() =>
      useJournalEditor('test-workplace' as WorkplaceId, { initialNotes: 'Custom Notes' }),
    );

    expect(result.current.notes).toBe('Custom Notes');
  });

  it('should update notes state using setNotes', () => {
    const { result } = renderHook(() => useJournalEditor('test-workplace' as WorkplaceId));

    act(() => {
      result.current.setNotes('New note value');
    });

    expect(result.current.notes).toBe('New note value');
  });

  it('should add lines', () => {
    const { result } = renderHook(() => useJournalEditor('test-workplace' as WorkplaceId));

    act(() => {
      result.current.addLine();
    });

    expect(result.current.lines).toHaveLength(3);
  });

  it('should remove lines but keep minimum 2', () => {
    const { result } = renderHook(() => useJournalEditor('test-workplace' as WorkplaceId));

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
    const mockOnSuccess = jest.fn();
    const { result } = renderHook(() =>
      useJournalEditor('test-workplace' as WorkplaceId, { onSuccess: mockOnSuccess }),
    );

    (journalService.saveJournalEntry as jest.Mock).mockResolvedValue({
      success: false,
      error: 'fail',
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(journalService.saveJournalEntry).toHaveBeenCalled();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('should succeed submission and call onSuccess', async () => {
    const mockOnSuccess = jest.fn();
    const { result } = renderHook(() =>
      useJournalEditor('test-workplace' as WorkplaceId, { onSuccess: mockOnSuccess }),
    );

    (journalService.saveJournalEntry as jest.Mock).mockResolvedValue({ success: true });

    await act(async () => {
      await result.current.submit();
    });

    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('should load journal data on edit', async () => {
    const mockJournal = {
      journalDate: '2024-01-01T12:00:00.000Z',
      description: 'Test Load',
      notes: 'Test Notes Loaded',
    };
    const mockTxs = [
      { id: '1', accountId: 'a1', amount: 10, currencyCode: 'USD', transactionType: 'DEBIT' },
      { id: '2', accountId: 'a2', amount: 10, currencyCode: 'USD', transactionType: 'CREDIT' },
    ];

    (journalRepository.find as jest.Mock).mockResolvedValue(mockJournal);
    (transactionService.getEnrichedByJournal as jest.Mock).mockResolvedValue(mockTxs);

    const { result } = renderHook(() =>
      useJournalEditor('test-workplace' as WorkplaceId, { journalId: 'j1' as JournalId }),
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.description).toBe('Test Load');
    expect(result.current.notes).toBe('Test Notes Loaded');
    expect(result.current.lines).toHaveLength(2);
  });
});
