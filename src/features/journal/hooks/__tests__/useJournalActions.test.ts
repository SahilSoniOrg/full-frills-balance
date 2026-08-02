import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions';
import { journalService } from '@/src/services/journal/journalDomainService';
import { JournalId, WorkplaceId } from '@/src/types/domain';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/services/journal/journalDomainService');
jest.mock('@/src/data/repositories/journal/journalTimelineModule');
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

  it('should delegate createJournal to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp' as WorkplaceId));
    const data = { description: 'test', currencyCode: 'USD', transactions: [] } as any;

    await act(async () => {
      await result.current.createJournal(data);
    });

    expect(journalService.createJournal).toHaveBeenCalledWith(data, 'test-wp' as WorkplaceId);
  });

  it('should delegate updateJournal to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp' as WorkplaceId));
    const data = { description: 'update' } as any;

    await act(async () => {
      await result.current.updateJournal('id1' as JournalId, data);
    });

    expect(journalService.updateJournal).toHaveBeenCalledWith(
      'id1' as JournalId,
      data,
      'test-wp' as WorkplaceId,
    );
  });

  it('should delegate deleteJournal to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp' as WorkplaceId));
    const journal = { id: 'id1' } as any;

    await act(async () => {
      await result.current.deleteJournal(journal);
    });

    expect(journalService.deleteJournal).toHaveBeenCalledWith(
      'id1' as JournalId,
      'test-wp' as WorkplaceId,
    );
  });

  it('should delegate recoverJournal to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp' as WorkplaceId));

    await act(async () => {
      await result.current.recoverJournal('id1' as JournalId);
    });

    expect(journalService.recoverJournal).toHaveBeenCalledWith(
      'id1' as JournalId,
      'test-wp' as WorkplaceId,
    );
  });

  it('should delegate postJournal to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp' as WorkplaceId));

    await act(async () => {
      await result.current.postJournal('id1' as JournalId);
    });

    expect(journalService.postJournal).toHaveBeenCalledWith(
      'id1' as JournalId,
      'test-wp' as WorkplaceId,
    );
  });

  it('should delegate duplicateJournal to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp' as WorkplaceId));

    await act(async () => {
      await result.current.duplicateJournal('id1' as JournalId);
    });

    expect(journalService.duplicateJournal).toHaveBeenCalledWith(
      'id1' as JournalId,
      'test-wp' as WorkplaceId,
    );
  });

  it('should delegate findJournal to journalQueryRepository', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp' as WorkplaceId));

    await act(async () => {
      await result.current.findJournal('id1' as JournalId);
    });

    expect(journalQueryRepository.find).toHaveBeenCalledWith(
      'test-wp' as WorkplaceId,
      'id1' as JournalId,
    );
  });

  it('should delegate saveJournalEntry to journalService with workplaceId', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp' as WorkplaceId));
    const params = {
      lines: [],
      description: 'Coffee',
      journalDate: '2026-08-03',
    } as any;

    await act(async () => {
      await result.current.saveJournalEntry(params);
    });

    expect(journalService.saveJournalEntry).toHaveBeenCalledWith({
      ...params,
      workplaceId: 'test-wp' as WorkplaceId,
    });
  });

  it('should delegate saveBulkJournalEntries to journalService', async () => {
    const { result } = renderHook(() => useJournalActions('test-wp' as WorkplaceId));
    const entries = [
      {
        lines: [],
        description: 'A',
        journalDate: Date.now(),
        workplaceId: 'test-wp' as WorkplaceId,
      },
    ] as any;

    await act(async () => {
      await result.current.saveBulkJournalEntries(entries);
    });

    expect(journalService.saveBulkJournalEntries).toHaveBeenCalledWith(entries);
  });
});
