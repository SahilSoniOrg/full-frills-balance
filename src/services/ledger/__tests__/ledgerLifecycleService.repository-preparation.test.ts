import { LedgerLifecycleService } from '@/src/services/ledger/ledgerLifecycleService';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import { JournalId, WorkplaceId } from '@/src/types/ids';

jest.mock('@/src/services/journal/JournalPersistenceService', () => ({
  journalPersistenceService: {
    delete: jest.fn(),
    recover: jest.fn(),
    post: jest.fn(),
    revertToPlanned: jest.fn(),
  },
}));

const WORKPLACE = 'wp-lifecycle' as WorkplaceId;
const JOURNAL_ID = 'journal-1' as JournalId;

describe('legacy ledger lifecycle façade', () => {
  const service = new LedgerLifecycleService();

  beforeEach(() => jest.clearAllMocks());

  it('delegates delete and recovery to journal persistence', async () => {
    const journal = { id: JOURNAL_ID };
    (journalPersistenceService.delete as jest.Mock).mockResolvedValue(undefined);
    (journalPersistenceService.recover as jest.Mock).mockResolvedValue(journal);

    await service.deleteJournal(JOURNAL_ID, WORKPLACE);
    await expect(service.recoverJournal(JOURNAL_ID, WORKPLACE)).resolves.toBe(journal);

    expect(journalPersistenceService.delete).toHaveBeenCalledWith(JOURNAL_ID, WORKPLACE);
    expect(journalPersistenceService.recover).toHaveBeenCalledWith(JOURNAL_ID, WORKPLACE);
  });

  it('delegates posting and reversion to journal persistence', async () => {
    const journal = { id: JOURNAL_ID };
    (journalPersistenceService.post as jest.Mock).mockResolvedValue(journal);
    (journalPersistenceService.revertToPlanned as jest.Mock).mockResolvedValue(journal);

    await expect(service.postJournal(JOURNAL_ID, WORKPLACE)).resolves.toBe(journal);
    await expect(service.revertToPlanned(JOURNAL_ID, WORKPLACE)).resolves.toBe(journal);

    expect(journalPersistenceService.post).toHaveBeenCalledWith(JOURNAL_ID, WORKPLACE);
    expect(journalPersistenceService.revertToPlanned).toHaveBeenCalledWith(JOURNAL_ID, WORKPLACE);
  });
});
