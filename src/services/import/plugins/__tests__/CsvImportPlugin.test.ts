import {
  csvPlugin,
  parseAmountString,
  parseCsvRows,
  parseFlexibleDate,
} from '@/src/services/import/plugins/csv-plugin';
import { ImportFileContext } from '@/src/services/import/types';
import { AccountType, TransactionType } from '@/src/types/domain';

jest.mock('@/src/data/database/idGenerator', () => {
  let counter = 0;
  return {
    generator: () => `mock-csv-id-${++counter}`,
  };
});

describe('CsvImportPlugin', () => {
  describe('helpers', () => {
    it('parses amounts correctly across formats', () => {
      expect(parseAmountString('100.50')).toBe(100.5);
      expect(parseAmountString('-50.25')).toBe(-50.25);
      expect(parseAmountString('$1,234.56')).toBe(1234.56);
      expect(parseAmountString('(75.00)')).toBe(-75);
      expect(parseAmountString('1.234,56 €')).toBe(1234.56);
      expect(parseAmountString('₹ 5,000.00')).toBe(5000);
      expect(parseAmountString('')).toBeNull();
      expect(parseAmountString('N/A')).toBeNull();
    });

    it('parses flexible dates', () => {
      const isoDate = parseFlexibleDate('2023-05-15');
      expect(new Date(isoDate).getFullYear()).toBe(2023);

      const usDate = parseFlexibleDate('05/15/2023');
      expect(new Date(usDate).getFullYear()).toBe(2023);

      const euDate = parseFlexibleDate('15/05/2023');
      expect(new Date(euDate).getFullYear()).toBe(2023);
    });

    it('tokenizes CSV rows with quotes and commas', () => {
      const csv =
        'Date,Description,Amount\n2023-01-01,"Coffee, Cake",-12.50\n2023-01-02,"Say ""Hello""",50.00';
      const rows = parseCsvRows(csv);
      expect(rows).toHaveLength(3);
      expect(rows[1][1]).toBe('Coffee, Cake');
      expect(rows[1][2]).toBe('-12.50');
      expect(rows[2][1]).toBe('Say "Hello"');
    });
  });

  describe('detect', () => {
    it('detects .csv file', () => {
      const context = {
        name: 'statement.csv',
        uri: 'file:///statement.csv',
        rawBytes: new Uint8Array(),
      } as ImportFileContext;
      expect(csvPlugin.detect(context)).toBe(true);
    });

    it('detects CSV by content headers', () => {
      const context = {
        name: 'statement.txt',
        uri: 'file:///statement.txt',
        text: 'Date,Narration,Withdrawal,Deposit\n2023-01-01,Groceries,50.00,0',
        rawBytes: new Uint8Array(),
      } as ImportFileContext;
      expect(csvPlugin.detect(context)).toBe(true);
    });

    it('returns false for unrelated text', () => {
      const context = {
        name: 'document.txt',
        uri: 'file:///document.txt',
        text: 'Hello world, this is not a CSV statement.',
        rawBytes: new Uint8Array(),
      } as ImportFileContext;
      expect(csvPlugin.detect(context)).toBe(false);
    });
  });

  describe('parse', () => {
    it('parses single amount CSV with categories and accounts', async () => {
      const csv = `Date,Payee,Amount,Category,Account
2023-01-01,Trader Joe's,-45.50,Groceries,Chase Checking
2023-01-02,Salary,3000.00,Work,Chase Checking
2023-01-03,Cash ATM,-100.00,,Chase Checking`;

      const context = {
        name: 'statement.csv',
        uri: 'file:///statement.csv',
        text: csv,
        rawBytes: new Uint8Array(),
      } as ImportFileContext;

      const result = await csvPlugin.parse(context, { defaultCurrency: 'USD' });

      expect(result.canonical).toBeDefined();
      const canonical = result.canonical!;

      // Verify accounts:
      // 1 real account: Chase Checking (ASSET)
      // 1 valid category: Groceries (USD) (EXPENSE)
      // 1 valid category: Work (USD) (INCOME)
      // 1 unknown category: Unknown Expense (USD) (EXPENSE) for the uncategorized ATM withdrawal
      const chase = canonical.accounts.find(a => a.name === 'Chase Checking');
      const groceries = canonical.accounts.find(a => a.name === 'Groceries (USD)');
      const work = canonical.accounts.find(a => a.name === 'Work (USD)');
      const unknownExpense = canonical.accounts.find(a => a.name === 'Unknown Expense (USD)');

      expect(chase).toBeDefined();
      expect(groceries).toBeDefined();
      expect(groceries?.accountType).toBe(AccountType.EXPENSE);

      expect(work).toBeDefined();
      expect(work?.accountType).toBe(AccountType.INCOME);

      expect(unknownExpense).toBeDefined();
      expect(unknownExpense?.accountType).toBe(AccountType.EXPENSE);

      // Verify transactions & journals
      expect(canonical.journals).toHaveLength(3);
      expect(canonical.transactions).toHaveLength(6);

      // Verify grocery transaction debits Groceries (USD) and credits Chase Checking
      const groceryJournal = canonical.journals.find(j => j.description === "Trader Joe's");
      expect(groceryJournal).toBeDefined();
      expect(groceryJournal?.totalAmount).toBe(45.5);

      const groceryDebit = canonical.transactions.find(
        t => t.journalId === groceryJournal!.id && t.accountId === groceries!.id,
      );
      expect(groceryDebit?.transactionType).toBe(TransactionType.DEBIT);

      // Verify salary transaction credits Work (USD) and debits Chase Checking
      const salaryJournal = canonical.journals.find(j => j.description === 'Salary');
      expect(salaryJournal).toBeDefined();

      const salaryCredit = canonical.transactions.find(
        t => t.journalId === salaryJournal!.id && t.accountId === work!.id,
      );
      expect(salaryCredit?.transactionType).toBe(TransactionType.CREDIT);
    });

    it('parses Debit/Credit dual-column bank statement format', async () => {
      const csv = `Transaction Date,Description,Debit,Credit
15/01/2023,Electric Bill,120.00,
16/01/2023,Freelance Payment,,450.00`;

      const context = {
        name: 'bank_statement.csv',
        uri: 'file:///bank_statement.csv',
        text: csv,
        rawBytes: new Uint8Array(),
      } as ImportFileContext;

      const result = await csvPlugin.parse(context, { defaultCurrency: 'USD' });

      expect(result.canonical).toBeDefined();
      const canonical = result.canonical!;

      expect(canonical.journals).toHaveLength(2);
      expect(canonical.transactions).toHaveLength(4);

      // Default imported account created
      const defaultAcc = canonical.accounts.find(a => a.name === 'Imported Account (USD)');
      expect(defaultAcc).toBeDefined();

      const unknownExpense = canonical.accounts.find(a => a.name === 'Unknown Expense (USD)');
      const unknownIncome = canonical.accounts.find(a => a.name === 'Unknown Income (USD)');

      expect(unknownExpense).toBeDefined();
      expect(unknownIncome).toBeDefined();
    });

    it('handles dirty CSV with preamble metadata headers before the table', async () => {
      const csv = `Chase Bank Export
Account: ****5678
Statement Date: 2023-01-31

Booking Date,Narration,Paid Out,Paid In
2023-01-10,Restaurant Dinner,78.50,
2023-01-12,Refund,,25.00`;

      const context = {
        name: 'chase_dirty.csv',
        uri: 'file:///chase_dirty.csv',
        text: csv,
        rawBytes: new Uint8Array(),
      } as ImportFileContext;

      const result = await csvPlugin.parse(context, { defaultCurrency: 'USD' });
      expect(result.canonical?.journals).toHaveLength(2);
      expect(result.canonical?.journals[0].description).toBe('Restaurant Dinner');
      expect(result.canonical?.journals[0].totalAmount).toBe(78.5);
    });
  });
});
