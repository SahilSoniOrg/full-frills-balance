import { accountQueryRepository } from '@/src/data/repositories/account';
import { journalListQueryRepository } from '@/src/data/repositories/journal/journalListQueryRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { convertAmount } from '@/src/services/currencyConversion';
import { AccountType, JournalDisplayType, JournalStatus, TransactionType } from '@/src/types/enums';
import { asWorkplaceId } from '@/src/types/ids';
import { readReportLedger } from '../ledgerFactReader';
import type { ReportQuery } from '../../types/query';

jest.mock('@/src/data/repositories/account', () => ({
  accountQueryRepository: { findAll: jest.fn() },
}));
jest.mock('@/src/data/repositories/journal/journalListQueryRepository', () => ({
  journalListQueryRepository: {
    findAll: jest.fn(),
    findAllPlanned: jest.fn(),
    findPostedInDateRange: jest.fn(),
    findPlannedInDateRange: jest.fn(),
  },
}));
jest.mock('@/src/data/repositories/transaction', () => ({
  transactionQueryRepository: {
    findAllNonDeleted: jest.fn(),
    findByJournals: jest.fn(),
  },
}));
jest.mock('@/src/services/currencyConversion', () => ({
  convertAmount: jest.fn(),
}));

const accounts = accountQueryRepository as jest.Mocked<typeof accountQueryRepository>;
const journals = journalListQueryRepository as jest.Mocked<typeof journalListQueryRepository>;
const transactions = transactionQueryRepository as jest.Mocked<typeof transactionQueryRepository>;
const convert = convertAmount as jest.MockedFunction<typeof convertAmount>;

const query: ReportQuery = {
  workplaceId: asWorkplaceId('workplace-1'),
  period: {
    startDate: Date.UTC(2026, 8, 1),
    endDate: Date.UTC(2026, 8, 16),
    timeZone: 'UTC',
  },
  targetCurrency: 'INR',
  basis: 'ACTUAL',
  comparison: 'NONE',
  granularity: 'AUTO',
  sections: ['income'],
};

describe('readReportLedger', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    accounts.findAll.mockResolvedValue([
      {
        id: 'salary',
        name: 'Salary',
        accountType: AccountType.INCOME,
        currencyCode: 'INR',
      },
    ] as never);
    journals.findPostedInDateRange.mockResolvedValue([
      {
        id: 'j1',
        journalDate: Date.UTC(2026, 8, 5),
        status: JournalStatus.POSTED,
        currencyCode: 'INR',
        displayType: JournalDisplayType.INCOME,
        description: 'Pay',
      },
    ] as never);
    transactions.findByJournals.mockResolvedValue([
      {
        id: 't1',
        journalId: 'j1',
        accountId: 'salary',
        amount: 1000,
        currencyCode: 'INR',
        transactionType: TransactionType.CREDIT,
      },
    ] as never);
  });

  it('reads only posted journals and their lines in the fact window', async () => {
    const snapshot = await readReportLedger(query, {
      factPeriod: {
        startDate: Date.UTC(2026, 7, 1),
        endDate: Date.UTC(2026, 8, 16),
        timeZone: 'UTC',
      },
    });

    expect(journals.findAll).not.toHaveBeenCalled();
    expect(transactions.findAllNonDeleted).not.toHaveBeenCalled();
    expect(journals.findPostedInDateRange).toHaveBeenCalledWith(
      query.workplaceId,
      Date.UTC(2026, 7, 1),
      Date.UTC(2026, 8, 16),
    );
    expect(transactions.findByJournals).toHaveBeenCalledWith(query.workplaceId, ['j1']);
    expect(convert).not.toHaveBeenCalled();
    expect(snapshot.actualFacts).toHaveLength(1);
    expect(snapshot.actualFacts[0]).toMatchObject({
      journalId: 'j1',
      historicalBaseAmount: 1000,
      signedBalanceDelta: 1000,
    });
  });

  it('converts only cross-currency lines', async () => {
    accounts.findAll.mockResolvedValue([
      {
        id: 'salary',
        name: 'Salary',
        accountType: AccountType.INCOME,
        currencyCode: 'USD',
      },
    ] as never);
    transactions.findByJournals.mockResolvedValue([
      {
        id: 't1',
        journalId: 'j1',
        accountId: 'salary',
        amount: 10,
        currencyCode: 'USD',
        transactionType: TransactionType.CREDIT,
        exchangeRate: 83,
      },
    ] as never);
    convert.mockResolvedValue({ ok: true, amount: 830 });

    const snapshot = await readReportLedger({ ...query, targetCurrency: 'INR' });

    expect(convert).toHaveBeenCalledTimes(1);
    expect(convert).toHaveBeenCalledWith(
      expect.objectContaining({
        fromCurrency: 'USD',
        toCurrency: 'INR',
        mode: 'historical',
        storedExchangeRate: 83,
        rateDate: Date.UTC(2026, 8, 5),
      }),
    );
    expect(snapshot.actualFacts[0]?.historicalBaseAmount).toBe(830);
  });

  it('keeps converted facts in journal line order when lookups finish out of order', async () => {
    accounts.findAll.mockResolvedValue([
      {
        id: 'usd-income',
        name: 'USD Income',
        accountType: AccountType.INCOME,
        currencyCode: 'USD',
      },
      {
        id: 'eur-income',
        name: 'EUR Income',
        accountType: AccountType.INCOME,
        currencyCode: 'EUR',
      },
    ] as never);
    transactions.findByJournals.mockResolvedValue([
      {
        id: 't-usd',
        journalId: 'j1',
        accountId: 'usd-income',
        amount: 10,
        currencyCode: 'USD',
        transactionType: TransactionType.CREDIT,
      },
      {
        id: 't-eur',
        journalId: 'j1',
        accountId: 'eur-income',
        amount: 5,
        currencyCode: 'EUR',
        transactionType: TransactionType.CREDIT,
      },
    ] as never);
    convert.mockImplementation(async input => {
      if (input.fromCurrency === 'USD') {
        await new Promise(resolve => setTimeout(resolve, 20));
        return { ok: true, amount: 830 };
      }
      return { ok: true, amount: 500 };
    });

    const snapshot = await readReportLedger({ ...query, targetCurrency: 'INR' });

    expect(snapshot.actualFacts.map(fact => fact.transactionId)).toEqual(['t-usd', 't-eur']);
  });

  it('attaches missing-rate quotes so fetch does not reload the ledger', async () => {
    accounts.findAll.mockResolvedValue([
      {
        id: 'usd-income',
        name: 'USD Income',
        accountType: AccountType.INCOME,
        currencyCode: 'USD',
      },
    ] as never);
    transactions.findByJournals.mockResolvedValue([
      {
        id: 't-usd',
        journalId: 'j1',
        accountId: 'usd-income',
        amount: 10,
        currencyCode: 'USD',
        transactionType: TransactionType.CREDIT,
      },
    ] as never);
    convert.mockResolvedValue({ ok: false, reason: 'missing_rate' });

    const snapshot = await readReportLedger({ ...query, targetCurrency: 'INR' });

    expect(snapshot.actualFacts).toHaveLength(0);
    expect(snapshot.warnings).toEqual([
      expect.objectContaining({
        code: 'MISSING_EXCHANGE_RATE',
        count: 1,
        journalIds: ['j1'],
        missingRateQuotes: [
          { fromCurrency: 'USD', toCurrency: 'INR', rateDate: Date.UTC(2026, 8, 5) },
        ],
      }),
    ]);
  });
});
