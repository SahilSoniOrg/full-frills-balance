import { rawSqlExecutor } from '@/src/data/repositories/raw/RawSqlExecutor';
import { currencyReadService } from '@/src/services/currency-read-service';
import { AccountType, TransactionType } from '@/src/types/enums';
import { asWorkplaceId } from '@/src/types/ids';
import { findUnbalancedJournals } from '../journalBalanceAudit';
jest.mock('@/src/data/repositories/raw/RawSqlExecutor', () => ({
  rawSqlExecutor: { query: jest.fn() },
}));

jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getPrecision: jest.fn().mockResolvedValue(2) },
}));

const rows = Array.from({ length: 250 }, (_, index) =>
  [TransactionType.DEBIT, TransactionType.CREDIT].map((transactionType, leg) => ({
    journalId: `journal-${String(index).padStart(4, '0')}`,
    journalCurrency: 'USD',
    description: 'Legacy deposit',
    journalDate: index,
    transactionId: `line-${index}-${leg}`,
    accountId: leg === 0 ? AccountType.ASSET : AccountType.EQUITY,
    accountName: leg === 0 ? 'Cash' : 'Equity',
    accountCurrency: 'USD',
    lineCurrency: 'USD',
    amount: leg === 0 || index !== 249 ? 50 : 49,
    exchangeRate: null,
    transactionType,
    notes: null,
  })),
).flat();

describe('journal balance audit responsiveness', () => {
  it('lets queued UI work run between bounded reads without splitting journal lines', async () => {
    const query = jest.mocked(rawSqlExecutor.query);
    let uiTurns = 0;
    const uiTurnsAtReads: number[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];
    query.mockImplementation(async (sql, args = []) => {
      uiTurnsAtReads.push(uiTurns);
      timers.push(setTimeout(() => uiTurns++, 0));
      if (!sql.includes('LIMIT')) return rows;
      const cursor = String(args[2]);
      const limit = Number(args[3]);
      const ids = [...new Set(rows.map(row => row.journalId))]
        .filter(id => id > cursor)
        .slice(0, limit);
      return rows.filter(row => ids.includes(row.journalId));
    });
    timers.push(setTimeout(() => uiTurns++, 0));
    try {
      const result = await findUnbalancedJournals(asWorkplaceId('audit-workplace'));
      expect(uiTurnsAtReads[0]).toBeGreaterThan(0);
      expect(query.mock.calls.length).toBeGreaterThan(1);
      expect(uiTurnsAtReads[uiTurnsAtReads.length - 1]).toBeGreaterThan(uiTurnsAtReads[0]);
      expect(result.journalsChecked).toBe(250);
      expect(currencyReadService.getPrecision).toHaveBeenCalledTimes(1);
      expect(result.unbalanced.map(entry => entry.journal.journalId)).toEqual(['journal-0249']);
    } finally {
      timers.forEach(clearTimeout);
    }
  });
});
