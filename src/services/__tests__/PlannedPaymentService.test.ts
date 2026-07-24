import { database } from '@/src/data/database/Database';
import { JournalStatus } from '@/src/data/models/Journal';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { ledgerWriteService } from '@/src/services/ledger';
import * as plannedPaymentOrchestration from '@/src/services/planned-payment/plannedPaymentOrchestration';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';
import { AccountId, WorkplaceId } from '@/src/types/domain';

jest.mock('@/src/services/ledger');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/repositories/TransactionRepository', () => ({
  transactionRepository: {
    findByJournal: jest.fn().mockResolvedValue([]),
  },
}));
jest.mock('@/src/data/database/Database', () => ({
  database: {
    write: jest.fn().mockImplementation(async (fn: any) => fn()),
    batch: jest.fn().mockResolvedValue(undefined),
    collections: {
      get: jest.fn().mockReturnValue({
        query: jest.fn().mockReturnThis(),
        fetch: jest.fn(),
      }),
    },
  },
}));

describe('PlannedPaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (journalRepository.findEarliestPlannedByPayment as jest.Mock).mockResolvedValue(undefined);
    (journalRepository.findPlannedOnDay as jest.Mock).mockResolvedValue([]);
    (journalRepository.batchUpdatePlannedStatus as jest.Mock).mockResolvedValue(undefined);
    (journalRepository.prepareMetadataPatch as jest.Mock).mockResolvedValue({});
    (journalRepository.findByPlannedPaymentAndStatus as jest.Mock).mockResolvedValue([]);
    (journalRepository.findByPlannedPaymentIds as jest.Mock).mockResolvedValue([]);
    (journalRepository.countOnDayByPlannedPayment as jest.Mock).mockResolvedValue(0);
  });

  describe('calculateNextOccurrence', () => {
    // Use fixed dates for testing
    // Jan 31, 2024 (Wednesday)
    const JAN_31_2024 = new Date(2024, 0, 31, 12, 0, 0).getTime();

    test('Daily: adds N days and normalizes to midnight', () => {
      const next = plannedPaymentService.calculateNextOccurrence(JAN_31_2024, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.DAILY,
      });
      const d = new Date(next);
      expect(d.getFullYear()).toBe(2024);
      expect(d.getMonth()).toBe(1); // Feb
      expect(d.getDate()).toBe(1);
      expect(d.getHours()).toBe(0);
    });

    test('Weekly: aligns to specific recurrenceWeekday (Monday)', () => {
      // Jan 22, 2024 is a Monday
      const monday = new Date(2024, 0, 22).getTime();
      const next = plannedPaymentService.calculateNextOccurrence(monday, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.WEEKLY,
        recurrenceDay: 1, // Monday
      });
      const d = new Date(next);
      expect(d.getDay()).toBe(1);
      expect(d.getDate()).toBe(29);
    });

    test('Monthly: handles month-end overflow (31st to 29th in Leap Year)', () => {
      const next = plannedPaymentService.calculateNextOccurrence(JAN_31_2024, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 31,
      });
      const d = new Date(next);
      expect(d.getMonth()).toBe(1); // Feb
      expect(d.getDate()).toBe(29); // Leap year 2024
    });

    test('Monthly: recovers to original recurrenceDay after shorter month', () => {
      // Feb 29, 2024
      const FEB_29_2024 = new Date(2024, 1, 29).getTime();
      const next = plannedPaymentService.calculateNextOccurrence(FEB_29_2024, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 31,
      });
      const d = new Date(next);
      expect(d.getMonth()).toBe(2); // Mar
      expect(d.getDate()).toBe(31); // Mar has 31 days
    });

    test('Yearly: aligns to specific recurrenceMonth and recurrenceDay', () => {
      const next = plannedPaymentService.calculateNextOccurrence(JAN_31_2024, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.YEARLY,
        recurrenceMonth: 12,
        recurrenceDay: 25,
      });
      const d = new Date(next);
      expect(d.getFullYear()).toBe(2025);
      expect(d.getMonth()).toBe(11); // Dec is 11
      expect(d.getDate()).toBe(25);
    });

    test('Weekly: just adds weeks if no specific weekday is set', () => {
      const next = plannedPaymentService.calculateNextOccurrence(JAN_31_2024, {
        intervalN: 2,
        intervalType: PlannedPaymentInterval.WEEKLY,
      });
      const d = new Date(next);
      expect(d.getDate()).toBe(14); // Jan 31 + 14 days = Feb 14
      expect(d.getMonth()).toBe(1);
    });

    test('Weekly: ensures N-week interval is respected even if target day is earlier in the week', () => {
      // Monday, Jan 22, 2024
      const monday = new Date(2024, 0, 22).getTime();
      const next = plannedPaymentService.calculateNextOccurrence(monday, {
        intervalN: 2,
        intervalType: PlannedPaymentInterval.WEEKLY,
        recurrenceDay: 0, // Sunday
      });
      const d = new Date(next);
      // Cycle: Jan 22 -> Feb 5 (+2 weeks)
      // Target Sun after Feb 5 is Feb 11
      expect(d.getDate()).toBe(11);
      expect(d.getMonth()).toBe(1); // Feb
      expect(d.getDay()).toBe(0);
    });
  });

  describe('computeFirstOccurrence', () => {
    // March 6, 2026 — a Friday (weekday index 5), at 10:30 AM raw
    const MAR_6_2026 = new Date(2026, 2, 6, 10, 30, 0).getTime();

    test('Daily: returns midnight of startDate', () => {
      const result = plannedPaymentService.computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.DAILY,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(2); // March
      expect(d.getDate()).toBe(6);
      expect(d.getHours()).toBe(0);
    });

    test('Monthly: recurrenceDay in the future this month → same month', () => {
      // Mar 6, recurrenceDay = 20 → Mar 20
      const result = plannedPaymentService.computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 20,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(2); // March
      expect(d.getDate()).toBe(20);
    });

    test('Monthly: recurrenceDay equals startDate day → same day', () => {
      const result = plannedPaymentService.computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 6,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(2); // March
      expect(d.getDate()).toBe(6);
    });

    test('Monthly: recurrenceDay already passed this month → next month', () => {
      // Mar 6, recurrenceDay = 5 → Apr 5
      const result = plannedPaymentService.computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 5,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(3); // April
      expect(d.getDate()).toBe(5);
    });

    test('Monthly: handles month-end overflow (recurrenceDay=31 in April → Apr 30)', () => {
      const APR_1_2026 = new Date(2026, 3, 1).getTime();
      const result = plannedPaymentService.computeFirstOccurrence(APR_1_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.MONTHLY,
        recurrenceDay: 31,
      });
      const d = new Date(result);
      expect(d.getMonth()).toBe(3); // April
      expect(d.getDate()).toBe(30);
    });

    test('Weekly: recurrenceDay ahead in week → returns correct upcoming day', () => {
      // Mar 6 is Friday (5), recurrenceDay = 0 (Sunday) → Mar 8
      const result = plannedPaymentService.computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.WEEKLY,
        recurrenceDay: 0, // Sunday
      });
      const d = new Date(result);
      expect(d.getDay()).toBe(0);
      expect(d.getDate()).toBe(8);
    });

    test('Weekly: recurrenceDay equals startDate weekday → same day', () => {
      // Mar 6 is Friday (5)
      const result = plannedPaymentService.computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.WEEKLY,
        recurrenceDay: 5, // Friday
      });
      const d = new Date(result);
      expect(d.getDay()).toBe(5);
      expect(d.getDate()).toBe(6);
    });

    test('Yearly: target month/day in future this year → same year', () => {
      // Mar 6, 2026, recurrenceMonth=12, recurrenceDay=25 → Dec 25, 2026
      const result = plannedPaymentService.computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.YEARLY,
        recurrenceMonth: 12,
        recurrenceDay: 25,
      });
      const d = new Date(result);
      expect(d.getFullYear()).toBe(2026);
      expect(d.getMonth()).toBe(11); // December
      expect(d.getDate()).toBe(25);
    });

    test('Yearly: target month/day already passed this year → next year', () => {
      // Mar 6, 2026, recurrenceMonth=1, recurrenceDay=15 → Jan 15, 2027
      const result = plannedPaymentService.computeFirstOccurrence(MAR_6_2026, {
        intervalN: 1,
        intervalType: PlannedPaymentInterval.YEARLY,
        recurrenceMonth: 1,
        recurrenceDay: 15,
      });
      const d = new Date(result);
      expect(d.getFullYear()).toBe(2027);
      expect(d.getMonth()).toBe(0); // January
      expect(d.getDate()).toBe(15);
    });
  });

  describe('postOccurrence', () => {
    const mockPP = {
      id: 'pp-1',
      name: 'Rent',
      amount: 1000,
      currencyCode: 'USD',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      intervalN: 1,
      intervalType: PlannedPaymentInterval.MONTHLY,
      nextOccurrence: new Date(2024, 0, 1).getTime(),
      status: PlannedPaymentStatus.ACTIVE,
    };

    test('Promotes existing PLANNED journal and updates associated transaction dates', async () => {
      const mockJournal = {
        id: 'existing-j-1',
        journalDate: new Date(2024, 0, 1).getTime(),
      };

      (journalRepository.findEarliestPlannedByPayment as jest.Mock).mockResolvedValue(mockJournal);
      (journalRepository.findPlannedOnDay as jest.Mock).mockResolvedValue([mockJournal]);
      (ledgerWriteService.postJournal as jest.Mock).mockResolvedValue({} as any);

      const updatePpSpy = jest
        .spyOn(plannedPaymentRepository, 'update')
        .mockResolvedValue({} as any);

      await plannedPaymentService.postOccurrence(
        'wp-1' as WorkplaceId,
        mockPP as any,
        mockPP.nextOccurrence,
      );

      expect(journalRepository.findEarliestPlannedByPayment).toHaveBeenCalledWith('wp-1', 'pp-1');
      expect(journalRepository.findPlannedOnDay).toHaveBeenCalledWith(
        'wp-1',
        'pp-1',
        expect.any(Number),
        expect.any(Number),
      );
      // Promote existing PLANNED journal via canonical ledger write path
      expect(ledgerWriteService.postJournal).toHaveBeenCalledWith('existing-j-1', 'wp-1');
      expect(ledgerWriteService.createJournal).not.toHaveBeenCalled();
      expect(updatePpSpy).toHaveBeenCalled();
    });

    test('Creates new POSTED journal if no PLANNED journal exists', async () => {
      (journalRepository.findEarliestPlannedByPayment as jest.Mock).mockResolvedValue(undefined);
      (journalRepository.findPlannedOnDay as jest.Mock).mockResolvedValue([]);

      const createJournalSpy = jest
        .spyOn(ledgerWriteService, 'createJournal')
        .mockResolvedValue({} as any);
      const updatePpSpy = jest
        .spyOn(plannedPaymentRepository, 'update')
        .mockResolvedValue({} as any);

      await plannedPaymentService.postOccurrence(
        'wp-1' as WorkplaceId,
        mockPP as any,
        mockPP.nextOccurrence,
      );

      expect(createJournalSpy).toHaveBeenCalled();
      expect(updatePpSpy).toHaveBeenCalled();
    });
  });

  describe('skipOccurrence', () => {
    const mockPP = {
      id: 'pp-1',
      nextOccurrence: new Date(2024, 0, 1).getTime(),
      intervalN: 1,
      amount: 1000,
      currencyCode: 'USD',
      fromAccountId: 'acc-1',
      toAccountId: 'acc-2',
      intervalType: PlannedPaymentInterval.MONTHLY,
    };

    test('Marks existing PLANNED journal as SKIPPED and advances schedule', async () => {
      const mockJournal = {
        id: 'existing-j-1',
        status: 'PLANNED',
        journalDate: mockPP.nextOccurrence,
        update: jest.fn().mockImplementation(async (fn: any) => fn(mockJournal)),
      };
      (journalRepository.findEarliestPlannedByPayment as jest.Mock).mockResolvedValue(mockJournal);
      (journalRepository.findPlannedOnDay as jest.Mock).mockResolvedValue([mockJournal]);
      (journalRepository.batchUpdatePlannedStatus as jest.Mock).mockImplementation(
        async (journals: any[], status: JournalStatus) => {
          for (const journal of journals) {
            journal.status = status;
          }
        },
      );

      await plannedPaymentService.skipOccurrence(
        'wp-1' as WorkplaceId,
        mockPP as any,
        mockPP.nextOccurrence,
      );

      expect(journalRepository.findEarliestPlannedByPayment).toHaveBeenCalledWith('wp-1', 'pp-1');
      expect(journalRepository.findPlannedOnDay).toHaveBeenCalledWith(
        'wp-1',
        'pp-1',
        expect.any(Number),
        expect.any(Number),
      );
      expect(journalRepository.batchUpdatePlannedStatus).toHaveBeenCalledWith(
        [mockJournal],
        JournalStatus.SKIPPED,
      );
      expect(mockJournal.status).toBe('SKIPPED');
      expect(plannedPaymentRepository.update).toHaveBeenCalled();

      const nextOcc = (plannedPaymentRepository.update as jest.Mock).mock.calls[0][2]
        .nextOccurrence as number;
      expect(new Date(nextOcc).getMonth()).toBe(1); // Feb
    });
  });

  describe('prepareMergeOperations', () => {
    test('handles dual-reference case (both from and to accounts are source accounts)', async () => {
      const sourceAccountIds = ['acc-1', 'acc-2'] as AccountId[];
      const targetAccountId = 'target-acc' as AccountId;
      const workplaceId = 'wp-1' as WorkplaceId;

      const mockPP = {
        id: 'pp-dual',
        fromAccountId: 'acc-1',
        toAccountId: 'acc-2',
        prepareUpdate: jest.fn().mockImplementation((fn: any) => {
          const record = { id: 'pp-dual', fromAccountId: 'acc-1', toAccountId: 'acc-2' };
          fn(record);
          return record;
        }),
      };

      // Mock repository to return the same PP for both queries
      (plannedPaymentRepository.findAllByFromAccountIds as jest.Mock).mockResolvedValue([mockPP]);
      (plannedPaymentRepository.findAllByToAccountIds as jest.Mock).mockResolvedValue([mockPP]);

      const ops = await plannedPaymentService.prepareMergeOperations(
        workplaceId,
        sourceAccountIds,
        targetAccountId,
      );

      // Verify exactly one prepareUpdate was called
      expect(mockPP.prepareUpdate).toHaveBeenCalledTimes(1);
      expect(ops.length).toBe(1);
      expect(ops[0].fromAccountId).toBe(targetAccountId);
      expect(ops[0].toAccountId).toBe(targetAccountId);
    });
  });

  describe('toggleStatus', () => {
    test('Pausing: toggles status to PAUSED and marks future PLANNED journals as PAUSED', async () => {
      const mockPP = {
        id: 'pp-1',
        status: PlannedPaymentStatus.ACTIVE,
        prepareUpdate: jest.fn().mockImplementation((fn: any) => {
          const record = { id: 'pp-1', status: PlannedPaymentStatus.ACTIVE };
          fn(record);
          return record;
        }),
      };

      const mockJournal = {
        id: 'j-planned',
        status: 'PLANNED',
        prepareUpdate: jest.fn().mockImplementation((fn: any) => {
          fn(mockJournal);
          return mockJournal;
        }),
      };

      (journalRepository.findByPlannedPaymentAndStatus as jest.Mock).mockResolvedValue([
        mockJournal,
      ]);

      const newStatus = await plannedPaymentService.toggleStatus(
        'wp-1' as WorkplaceId,
        mockPP as any,
      );

      expect(journalRepository.findByPlannedPaymentAndStatus).toHaveBeenCalledWith(
        'wp-1',
        'pp-1',
        JournalStatus.PLANNED,
      );
      expect(newStatus).toBe(PlannedPaymentStatus.PAUSED);
      expect(mockPP.prepareUpdate).toHaveBeenCalled();
      expect(mockJournal.prepareUpdate).toHaveBeenCalled();
      expect(mockJournal.status).toBe('PAUSED');
      expect(database.batch).toHaveBeenCalled();
    });

    test('Resuming: toggles status to ACTIVE, updates paused journals, and processes due payments', async () => {
      const mockPP = {
        id: 'pp-1',
        status: PlannedPaymentStatus.PAUSED,
        nextOccurrence: Date.now() - 100000000, // in the past
        intervalN: 1,
        intervalType: PlannedPaymentInterval.DAILY,
        prepareUpdate: jest.fn().mockImplementation((fn: any) => {
          fn(mockPP);
          return mockPP;
        }),
      };

      const futureDate = Date.now() + 100000;
      const pastDate = Date.now() - 100000000;

      const mockFutureJournal = {
        id: 'j-future',
        journalDate: futureDate,
        status: 'PAUSED',
        prepareUpdate: jest.fn().mockImplementation((fn: any) => {
          fn(mockFutureJournal);
          return mockFutureJournal;
        }),
      };

      const mockPastJournal = {
        id: 'j-past',
        journalDate: pastDate,
        status: 'PAUSED',
        prepareUpdate: jest.fn().mockImplementation((fn: any) => {
          fn(mockPastJournal);
          return mockPastJournal;
        }),
      };

      (journalRepository.findByPlannedPaymentAndStatus as jest.Mock).mockResolvedValue([
        mockFutureJournal,
        mockPastJournal,
      ]);
      (plannedPaymentRepository.findAllActive as jest.Mock).mockResolvedValue([]);

      const processDueSpy = jest
        .spyOn(plannedPaymentOrchestration, 'processDuePlannedPayments')
        .mockResolvedValue(undefined);

      const oldNextOccurrence = mockPP.nextOccurrence;
      const newStatus = await plannedPaymentService.toggleStatus(
        'wp-1' as WorkplaceId,
        mockPP as any,
      );

      expect(journalRepository.findByPlannedPaymentAndStatus).toHaveBeenCalledWith(
        'wp-1',
        'pp-1',
        JournalStatus.PAUSED,
      );
      expect(newStatus).toBe(PlannedPaymentStatus.ACTIVE);
      expect(mockPP.prepareUpdate).toHaveBeenCalled();
      expect(mockPP.nextOccurrence).toBeGreaterThan(oldNextOccurrence);
      expect(mockPP.nextOccurrence).toBeGreaterThanOrEqual(Date.now() - 86400000); // normalized to today midnight
      expect(mockFutureJournal.prepareUpdate).toHaveBeenCalled();
      expect(mockPastJournal.prepareUpdate).toHaveBeenCalled();
      expect(mockFutureJournal.status).toBe('PLANNED');
      expect(mockPastJournal.status).toBe('SKIPPED');
      // Lifecycle calls processDuePlannedPayments directly (not the façade method).
      expect(processDueSpy).toHaveBeenCalledWith('wp-1');
      processDueSpy.mockRestore();
    });
  });
});
