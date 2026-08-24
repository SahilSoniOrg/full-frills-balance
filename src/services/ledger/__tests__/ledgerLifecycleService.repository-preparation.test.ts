import type Journal from '@/src/data/models/Journal';
import type Transaction from '@/src/data/models/Transaction';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { journalMetadataRepository } from '@/src/data/repositories/journal/journalMetadataRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalTimelineModule';
import { journalWriteRepository } from '@/src/data/repositories/journal/journalWriteModule';
import { persistBatch } from '@/src/data/repositories/persistBatch';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { LedgerLifecycleService } from '@/src/services/ledger/ledgerLifecycleService';
import { normalizeToStartOfDay } from '@/src/services/planned-payment/plannedPaymentRecurrence';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import type { Model } from '@nozbe/watermelondb';

jest.mock('@/src/data/repositories/AuditRepository', () => ({
  auditRepository: { prepareLog: jest.fn() },
}));
jest.mock('@/src/data/repositories/journal/journalMetadataRepository', () => ({
  journalMetadataRepository: {
    preparePatch: jest.fn(),
    findByJournalId: jest.fn(),
  },
}));
jest.mock('@/src/data/repositories/journal/journalTimelineModule', () => ({
  journalQueryRepository: { find: jest.fn() },
}));
jest.mock('@/src/data/repositories/journal/journalWriteModule', () => ({
  journalWriteRepository: {
    fetchJournalForDeletion: jest.fn(),
    prepareDeleteJournalUpdates: jest.fn(),
    prepareRecoverJournalUpdates: jest.fn(),
    preparePostJournalUpdates: jest.fn(),
    prepareRevertJournalUpdates: jest.fn(),
  },
}));
jest.mock('@/src/data/repositories/persistBatch', () => ({ persistBatch: jest.fn() }));
jest.mock('@/src/data/repositories/PlannedPaymentRepository', () => ({
  plannedPaymentRepository: { find: jest.fn() },
}));
jest.mock('@/src/data/repositories/transaction', () => ({
  transactionQueryRepository: { findByJournal: jest.fn() },
}));
jest.mock('@/src/services/RebuildQueueService', () => ({
  rebuildQueueService: { enqueueMany: jest.fn() },
}));
jest.mock('@/src/utils/logger', () => ({ logger: { info: jest.fn() } }));

const WORKPLACE = 'wp-lifecycle' as WorkplaceId;
const JOURNAL_ID = 'journal-1' as JournalId;

function model(kind: string): Model {
  return { kind } as unknown as Model;
}

function fixtures(status = JournalStatus.PLANNED) {
  const journal = {
    id: JOURNAL_ID,
    workplaceId: WORKPLACE,
    status,
    journalDate: 1_000,
    description: 'Lifecycle journal',
    totalAmount: 50,
    currencyCode: 'USD',
    prepareUpdate: jest.fn(),
  } as unknown as Journal & { prepareUpdate: jest.Mock };
  const transactions = [
    {
      id: 'transaction-cash',
      workplaceId: WORKPLACE,
      accountId: 'cash',
      amount: 50,
      transactionType: TransactionType.DEBIT,
      currencyCode: 'USD',
      prepareUpdate: jest.fn(),
    },
    {
      id: 'transaction-expense',
      workplaceId: WORKPLACE,
      accountId: 'expense',
      amount: 50,
      transactionType: TransactionType.CREDIT,
      currencyCode: 'USD',
      prepareUpdate: jest.fn(),
    },
  ] as unknown as (Transaction & { prepareUpdate: jest.Mock })[];

  return { journal, transactions };
}

describe('LedgerLifecycleService repository preparation boundary', () => {
  const service = new LedgerLifecycleService();
  const persistBatchMock = persistBatch as jest.MockedFunction<typeof persistBatch>;
  const batches: Model[][] = [];

  beforeEach(() => {
    jest.clearAllMocks();
    batches.length = 0;
    persistBatchMock.mockImplementation(async (opsOrFactory, afterBatch) => {
      const ops = typeof opsOrFactory === 'function' ? await opsOrFactory() : opsOrFactory;
      batches.push([...ops]);
      afterBatch?.();
    });
    (auditRepository.prepareLog as jest.Mock).mockReturnValue(model('audit'));
    (journalMetadataRepository.preparePatch as jest.Mock).mockResolvedValue(model('metadata'));
    (journalMetadataRepository.findByJournalId as jest.Mock).mockResolvedValue(null);
    (plannedPaymentRepository.find as jest.Mock).mockResolvedValue({ id: 'planned-payment' });
  });

  it.each([
    ['delete', 'prepareDeleteJournalUpdates'],
    ['recover', 'prepareRecoverJournalUpdates'],
  ] as const)(
    'delegates %s model preparation and preserves audit/rebuild ordering',
    async (_, method) => {
      const { journal, transactions } = fixtures();
      const lifecycleOps = [model('journal'), model('transaction-1'), model('transaction-2')];
      (journalWriteRepository[method] as jest.Mock).mockReturnValue(lifecycleOps);
      (journalWriteRepository.fetchJournalForDeletion as jest.Mock).mockResolvedValue({
        journal,
        transactions,
      });

      if (method === 'prepareDeleteJournalUpdates') {
        await service.deleteJournal(JOURNAL_ID, WORKPLACE);
      } else {
        await service.recoverJournal(JOURNAL_ID, WORKPLACE);
      }

      expect(batches).toEqual([[...lifecycleOps, model('audit')]]);
      expect(journalWriteRepository[method]).toHaveBeenCalledWith(
        journal,
        transactions,
        WORKPLACE,
        expect.any(Date),
      );
      expect(journal.prepareUpdate).not.toHaveBeenCalled();
      for (const transaction of transactions) {
        expect(transaction.prepareUpdate).not.toHaveBeenCalled();
      }
      expect(rebuildQueueService.enqueueMany).toHaveBeenCalledWith(
        ['cash', 'expense'],
        journal.journalDate,
        WORKPLACE,
      );
    },
  );

  it('keeps post order as metadata, lifecycle models, audit, then extraOps', async () => {
    const { journal, transactions } = fixtures();
    (journalQueryRepository.find as jest.Mock).mockResolvedValue(journal);
    (transactionQueryRepository.findByJournal as jest.Mock).mockResolvedValue(transactions);

    const lifecycleOps = [model('journal'), model('transaction-1'), model('transaction-2')];
    const extraOp = model('extra');
    (journalWriteRepository.preparePostJournalUpdates as jest.Mock).mockReturnValue(lifecycleOps);
    const extraOps = jest.fn(() => [extraOp]);
    const afterBatch = jest.fn();

    await service.postJournal(JOURNAL_ID, WORKPLACE, { extraOps, afterBatch });

    expect(batches).toEqual([[model('metadata'), ...lifecycleOps, model('audit'), extraOp]]);
    expect(extraOps).toHaveBeenCalledWith(journal);
    expect(journalWriteRepository.preparePostJournalUpdates).toHaveBeenCalledWith(
      journal,
      transactions,
      WORKPLACE,
      expect.any(Number),
    );
    expect(
      (journalWriteRepository.preparePostJournalUpdates as jest.Mock).mock.invocationCallOrder[0],
    ).toBeGreaterThan(extraOps.mock.invocationCallOrder[0]);
    expect(journal.prepareUpdate).not.toHaveBeenCalled();
    for (const transaction of transactions) {
      expect(transaction.prepareUpdate).not.toHaveBeenCalled();
    }
    expect(rebuildQueueService.enqueueMany).toHaveBeenCalledWith(
      ['cash', 'expense'],
      expect.any(Number),
      WORKPLACE,
    );
    expect(afterBatch).toHaveBeenCalledTimes(1);
  });

  it('delegates revert model preparation and preserves its rebuild date', async () => {
    const { journal, transactions } = fixtures(JournalStatus.POSTED);
    (journalQueryRepository.find as jest.Mock).mockResolvedValue(journal);
    (transactionQueryRepository.findByJournal as jest.Mock).mockResolvedValue(transactions);
    const revertTime = normalizeToStartOfDay(journal.journalDate);

    const lifecycleOps = [model('journal'), model('transaction-1'), model('transaction-2')];
    (journalWriteRepository.prepareRevertJournalUpdates as jest.Mock).mockReturnValue(lifecycleOps);

    await service.revertToPlanned(JOURNAL_ID, WORKPLACE);

    expect(batches).toEqual([[...lifecycleOps, model('audit')]]);
    expect(journalWriteRepository.prepareRevertJournalUpdates).toHaveBeenCalledWith(
      journal,
      transactions,
      WORKPLACE,
      revertTime,
    );
    expect(rebuildQueueService.enqueueMany).toHaveBeenCalledWith(
      ['cash', 'expense'],
      revertTime,
      WORKPLACE,
    );
    expect(journal.prepareUpdate).not.toHaveBeenCalled();
    for (const transaction of transactions) {
      expect(transaction.prepareUpdate).not.toHaveBeenCalled();
    }
  });
});
