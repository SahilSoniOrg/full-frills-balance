import Account, { AccountSubtype, AccountType } from '@/src/data/models/Account';
import { cashFlowSimulationService } from '@/src/services/insight/CashFlowSimulationService';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import dayjs from 'dayjs';

jest.mock('@/src/data/repositories/TransactionRawRepository');
jest.mock('@/src/data/repositories/TransactionRepository');
jest.mock('@/src/utils/logger', () => ({
    logger: {
        info: jest.fn(),
        error: jest.fn(),
    },
}));

describe('CashFlowSimulationService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        jest.setSystemTime(new Date('2026-03-08T00:00:00.000Z'));
        (transactionRepository.findByJournals as jest.Mock).mockResolvedValue([]);
        (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(new Map());
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    it('uses only the credit card statement due in the window for safe-to-spend', async () => {
        const creditCard = {
            id: 'cc-1',
            name: 'Primary Card',
            accountType: AccountType.LIABILITY,
            accountSubtype: AccountSubtype.CREDIT_CARD,
            metadataRecords: {
                fetch: jest.fn().mockResolvedValue([{ statementDay: 5, dueDay: 20 }]),
            },
        } as unknown as Account;

        (transactionRawRepository.getLatestBalancesRaw as jest.Mock).mockResolvedValue(
            new Map([[creditCard.id, -250]])
        );

        const result = await cashFlowSimulationService.simulateSafeToSpend(
            1000,
            new Array(30).fill(0),
            [],
            [],
            ['cash-1'],
            [{ account: creditCard, balance: 400 }],
            new Set(),
            'USD',
        );

        expect(result.totalLiabilities).toBe(400);
        expect(result.committedLiabilities).toBe(250);
        expect(result.committedLiabilitiesCC).toBe(250);
        expect(result.totalLiabilitiesCC).toBe(400);
        expect(result.safeToSpend).toBe(750);
    });

    it('tracks manual liability payments as commitments without subtracting the whole balance twice', async () => {
        const creditCard = {
            id: 'cc-1',
            name: 'Primary Card',
            accountType: AccountType.LIABILITY,
            accountSubtype: AccountSubtype.CREDIT_CARD,
            metadataRecords: {
                fetch: jest.fn().mockResolvedValue([{ statementDay: 5, dueDay: 20 }]),
            },
        } as unknown as Account;

        const plannedPayment = {
            id: 'pp-1',
            name: 'Card payment',
            fromAccountId: 'cash-1',
            toAccountId: creditCard.id,
            amount: 300,
            nextOccurrence: dayjs().add(2, 'day').valueOf(),
            intervalType: 'MONTHLY',
            intervalN: 1,
            currencyCode: 'USD',
        };

        const result = await cashFlowSimulationService.simulateSafeToSpend(
            1000,
            new Array(30).fill(0),
            [plannedPayment as any],
            [],
            ['cash-1'],
            [{ account: creditCard, balance: 400 }],
            new Set(),
            'USD',
        );

        expect(result.totalLiabilities).toBe(400);
        expect(result.committedLiabilities).toBe(300);
        expect(result.committedLiabilitiesCC).toBe(300);
        expect(result.safeToSpend).toBe(700);
    });
});
