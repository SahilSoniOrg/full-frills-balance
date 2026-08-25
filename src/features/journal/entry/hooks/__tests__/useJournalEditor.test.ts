import { journalReadService } from '@/src/services/journal/journalReadService';
import { useJournalEditor } from '@/src/features/journal/entry/hooks/useJournalEditor';
import { journalService } from '@/src/services/journal/journalDomainService';
import { showErrorAlert } from '@/src/utils/alerts';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { useRouter } from 'expo-router';
import { JournalId, WorkplaceId } from '@/src/types/ids';

// Mock dependencies
jest.mock('@/src/services/journal/journalDomainService');
jest.mock('@/src/services/transaction-ingestion');
jest.mock('@/src/services/journal/journalReadService', () => ({
  journalReadService: { find: jest.fn(), getJournalForEditor: jest.fn() },
}));
jest.mock('@/src/data/repositories/transaction');
jest.mock('expo-router', () => ({
  useRouter: jest.fn(),
}));
jest.mock('@/src/utils/alerts', () => ({
  showErrorAlert: jest.fn(),
}));

const mockBack = jest.fn();
(useRouter as jest.Mock).mockReturnValue({ back: mockBack });

// Mock useAdvancedModePrefs
jest.mock('@/src/hooks/useAdvancedModePrefs', () => ({
  useAdvancedModePrefs: jest.fn(() => ({
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

// Mock useWorkplace
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: jest.fn(() => ({
    workplaceId: 'test-workplace',
    defaultCurrencyCode: 'USD',
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

  it('initializes a prefilled draft without moving notes into the description', () => {
    const { result } = renderHook(() =>
      useJournalEditor('test-workplace' as WorkplaceId, {
        initialDescription: 'Coffee Shop',
        initialNotes: 'Imported from SMS',
        initialAmount: '12.34',
        initialDate: '2026-08-25T12:30:00+05:30',
      }),
    );

    expect(result.current.description).toBe('Coffee Shop');
    expect(result.current.notes).toBe('Imported from SMS');
    expect(result.current.journalDate).toBe('2026-08-25');
    expect(result.current.journalTime).toBe('12:30');
    expect(result.current.lines.some(line => line.amount === '12.34')).toBe(true);
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

    (journalService.postPostingPlan as jest.Mock).mockResolvedValue({
      success: false,
      error: 'fail',
    });

    await act(async () => {
      await result.current.submit();
    });

    expect(journalService.postPostingPlan).toHaveBeenCalled();
    expect(mockOnSuccess).not.toHaveBeenCalled();
  });

  it('should succeed submission and call onSuccess', async () => {
    const mockOnSuccess = jest.fn();
    const { result } = renderHook(() =>
      useJournalEditor('test-workplace' as WorkplaceId, { onSuccess: mockOnSuccess }),
    );

    (journalService.postPostingPlan as jest.Mock).mockResolvedValue({ success: true });

    await act(async () => {
      await result.current.submit();
    });

    expect(mockOnSuccess).toHaveBeenCalled();
  });

  it('should load journal data on edit', async () => {
    const mockEditorData = {
      journal: {
        journalDate: '2024-01-01T12:00:00.000Z',
        description: 'Test Load',
        notes: 'Test Notes Loaded',
      },
      lines: [
        { id: '1', accountId: 'a1', amount: '10', currencyCode: 'USD', transactionType: 'DEBIT' },
        { id: '2', accountId: 'a2', amount: '10', currencyCode: 'USD', transactionType: 'CREDIT' },
      ],
      transactionType: 'expense',
      forceAdvancedMode: false,
    };

    (journalReadService.getJournalForEditor as jest.Mock).mockResolvedValue(mockEditorData);

    const { result } = renderHook(() =>
      useJournalEditor('test-workplace' as WorkplaceId, { journalId: 'j1' as JournalId }),
    );

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.loadState).toBe('loaded');
    expect(result.current.description).toBe('Test Load');
    expect(result.current.notes).toBe('Test Notes Loaded');
    expect(result.current.lines).toHaveLength(2);
  });

  it('ignores stale edit loads when journalId changes before fetch completes', async () => {
    const mockDataJ1 = {
      journal: {
        journalDate: '2024-01-01T12:00:00.000Z',
        description: 'Journal One',
        notes: '',
      },
      lines: [],
      transactionType: 'expense',
      forceAdvancedMode: false,
    };
    const mockDataJ2 = {
      journal: {
        journalDate: '2024-01-02T12:00:00.000Z',
        description: 'Journal Two',
        notes: '',
      },
      lines: [
        { id: '1', accountId: 'a1', amount: '20', currencyCode: 'USD', transactionType: 'DEBIT' },
        { id: '2', accountId: 'a2', amount: '20', currencyCode: 'USD', transactionType: 'CREDIT' },
      ],
      transactionType: 'expense',
      forceAdvancedMode: false,
    };

    let resolveJ1: (value: typeof mockDataJ1) => void;
    const j1Promise = new Promise<typeof mockDataJ1>(resolve => {
      resolveJ1 = resolve;
    });

    (journalReadService.getJournalForEditor as jest.Mock).mockImplementation(
      (_wp: string, id: string) => {
        if (id === 'j1') return j1Promise;
        return Promise.resolve(mockDataJ2);
      },
    );

    const { result, rerender } = renderHook(
      ({ journalId }: { journalId: JournalId }) =>
        useJournalEditor('test-workplace' as WorkplaceId, { journalId }),
      { initialProps: { journalId: 'j1' as JournalId } },
    );

    rerender({ journalId: 'j2' as JournalId });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.description).toBe('Journal Two');

    resolveJ1!(mockDataJ1);
    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.description).toBe('Journal Two');
  });

  it('finishes a failed edit load and reports the failure', async () => {
    (journalReadService.getJournalForEditor as jest.Mock).mockRejectedValue(
      new Error('database unavailable'),
    );

    const { result } = renderHook(() =>
      useJournalEditor('test-workplace' as WorkplaceId, { journalId: 'missing' as JournalId }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(showErrorAlert).toHaveBeenCalledWith('Failed to load transaction');
    expect(result.current.loadState).toBe('error');
    expect(result.current.description).toBe('');
  });

  it('reports a missing edit journal as not found', async () => {
    (journalReadService.getJournalForEditor as jest.Mock).mockResolvedValue(null);

    const { result } = renderHook(() =>
      useJournalEditor('test-workplace' as WorkplaceId, { journalId: 'missing' as JournalId }),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.loadState).toBe('not_found');
    expect(showErrorAlert).not.toHaveBeenCalled();
  });
});
