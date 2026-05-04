import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { journalService } from '@/src/features/journal/services/JournalService';
import { ledgerWriteService } from '@/src/services/ledger';
import { act, renderHook } from '@testing-library/react-native';

// Mock dependencies
jest.mock('@/src/features/journal/services/JournalService');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/services/ledger', () => ({
  ledgerWriteService: { createJournal: jest.fn() },
}));
jest.mock('@/src/data/database/Database', () => ({
  database: {
    write: jest.fn(),
    collections: { get: jest.fn() },
  },
}));

describe('useJournalActions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should delegate createJournal to ledgerWriteService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp'));
    const data = { description: 'test', currencyCode: 'USD', transactions: [] } as any;

    await act(async () => {
      await result.current.createJournal(data);
    });

    expect(ledgerWriteService.createJournal).toHaveBeenCalledWith(data, 'test-wp');
  });

  it('should delegate updateJournal to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp'));
    const data = { description: 'update' } as any;

    await act(async () => {
      await result.current.updateJournal('id1', data);
    });

    expect(journalService.updateJournal).toHaveBeenCalledWith('id1', data, 'test-wp');
  });

  it('should delegate deleteJournal to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp'));
    const journal = { id: 'id1' } as any;

    await act(async () => {
      await result.current.deleteJournal(journal);
    });

    expect(journalService.deleteJournal).toHaveBeenCalledWith('id1', 'test-wp');
  });

  it('should delegate duplicateJournal to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp'));

    await act(async () => {
      await result.current.duplicateJournal('id1');
    });

    expect(journalService.duplicateJournal).toHaveBeenCalledWith('id1', 'test-wp');
  });

  it('should delegate findJournal to journalRepository', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp'));

    await act(async () => {
      await result.current.findJournal('id1');
    });

    expect(journalRepository.find).toHaveBeenCalledWith('id1', 'test-wp');
  });
});
