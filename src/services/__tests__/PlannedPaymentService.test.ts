import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/data/models/PlannedPayment';
import { journalRepository } from '@/src/data/repositories/JournalRepository';
import { plannedPaymentRepository } from '@/src/data/repositories/PlannedPaymentRepository';
import { ledgerWriteService } from '@/src/services/ledger';
import { plannedPaymentService } from '@/src/services/PlannedPaymentService';

jest.mock('@/src/services/ledger');
jest.mock('@/src/services/RebuildQueueService');
jest.mock('@/src/data/repositories/PlannedPaymentRepository');
jest.mock('@/src/data/repositories/JournalRepository');
jest.mock('@/src/data/repositories/TransactionRepository', () => ({
    transactionRepository: {
        findByJournal: jest.fn().mockResolvedValue([]),
    }
}));
jest.mock('@/src/data/database/Database', () => ({
    database: {
        write: jest.fn().mockImplementation(async (fn: any) => fn()),
        collections: {
            get: jest.fn().mockReturnValue({
                query: jest.fn().mockReturnThis(),
                fetch: jest.fn(),
            }),
        },
    },
}));

import { database } from '@/src/data/database/Database';

describe('PlannedPaymentService', () => {
    describe('calculateNextOccurrence', () => {
        // Use fixed dates for testing
        // Jan 31, 2024 (Wednesday)
        const JAN_31_2024 = new Date(2024, 0, 31, 12, 0, 0).getTime();

        test('Daily: adds N days and normalizes to midnight', () => {
            const next = plannedPaymentService.calculateNextOccurrence(JAN_31_2024, {
                intervalN: 1,
                intervalType: PlannedPaymentInterval.DAILY
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
                recurrenceDay: 1 // Monday
            });
            const d = new Date(next);
            expect(d.getDay()).toBe(1);
            expect(d.getDate()).toBe(29);
        });

        test('Monthly: handles month-end overflow (31st to 29th in Leap Year)', () => {
            const next = plannedPaymentService.calculateNextOccurrence(JAN_31_2024, {
                intervalN: 1,
                intervalType: PlannedPaymentInterval.MONTHLY,
                recurrenceDay: 31
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
                recurrenceDay: 31
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
                recurrenceDay: 25
            });
            const d = new Date(next);
            expect(d.getFullYear()).toBe(2025);
            expect(d.getMonth()).toBe(11); // Dec is 11
            expect(d.getDate()).toBe(25);
        });

        test('Weekly: just adds weeks if no specific weekday is set', () => {
            const next = plannedPaymentService.calculateNextOccurrence(JAN_31_2024, {
                intervalN: 2,
                intervalType: PlannedPaymentInterval.WEEKLY
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
                recurrenceDay: 0 // Sunday
            });
            const d = new Date(next);
            // Cycle: Jan 22 -> Feb 5 (+2 weeks)
            // Target Sun after Feb 5 is Feb 11
            expect(d.getDate()).toBe(11);
            expect(d.getMonth()).toBe(1); // Feb
            expect(d.getDay()).toBe(0);
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
            status: PlannedPaymentStatus.ACTIVE
        };

        test('Promotes existing PLANNED journal if found on the same day', async () => {
            const mockJournal = { id: 'existing-j-1', journalDate: new Date(2024, 0, 1).getTime(), update: jest.fn().mockImplementation(async (fn: any) => fn(mockJournal)) };
            const queryFetchSpy = jest.fn().mockResolvedValue([mockJournal]);
            (database.collections.get as jest.Mock).mockReturnValue({
                query: jest.fn().mockReturnThis(),
                fetch: queryFetchSpy,
            });

            const updatePpSpy = jest.spyOn(plannedPaymentRepository, 'update').mockResolvedValue({} as any);

            await plannedPaymentService.postOccurrence(mockPP as any, mockPP.nextOccurrence);

            // Should use database.write to patch status, NOT ledgerWriteService.createJournal
            expect(database.write).toHaveBeenCalled();
            expect(ledgerWriteService.createJournal).not.toHaveBeenCalled();
            expect(updatePpSpy).toHaveBeenCalled();
        });

        test('Creates new POSTED journal if no PLANNED journal exists', async () => {
            const queryFetchSpy = jest.fn().mockResolvedValue([]);
            (database.collections.get as jest.Mock).mockReturnValue({
                query: jest.fn().mockReturnThis(),
                fetch: queryFetchSpy,
            });

            const createJournalSpy = jest.spyOn(ledgerWriteService, 'createJournal').mockResolvedValue({} as any);
            const updatePpSpy = jest.spyOn(plannedPaymentRepository, 'update').mockResolvedValue({} as any);

            await plannedPaymentService.postOccurrence(mockPP as any, mockPP.nextOccurrence);

            expect(createJournalSpy).toHaveBeenCalled();
            expect(updatePpSpy).toHaveBeenCalled();
        });
    });

    describe('skipOccurrence', () => {
        const mockPP = {
            id: 'pp-1',
            nextOccurrence: new Date(2024, 0, 1).getTime(),
            intervalN: 1,
            intervalType: PlannedPaymentInterval.MONTHLY,
        };

        test('Deletes existing PLANNED journal and advances schedule', async () => {
            const queryFetchSpy = jest.fn().mockResolvedValue([{ id: 'j-to-skip' }]);
            (database.collections.get as jest.Mock).mockReturnValue({
                query: jest.fn().mockReturnThis(),
                fetch: queryFetchSpy,
            });

            const deleteJournalSpy = jest.spyOn(journalRepository, 'deleteJournal').mockResolvedValue(undefined);
            const updatePpSpy = jest.spyOn(plannedPaymentRepository, 'update').mockResolvedValue({} as any);

            await plannedPaymentService.skipOccurrence(mockPP as any, mockPP.nextOccurrence);

            expect(deleteJournalSpy).toHaveBeenCalledWith('j-to-skip');
            expect(updatePpSpy).toHaveBeenCalled();

            const nextOcc = updatePpSpy.mock.calls[0][1].nextOccurrence as number;
            expect(new Date(nextOcc).getMonth()).toBe(1); // Feb
        });
    });
});
