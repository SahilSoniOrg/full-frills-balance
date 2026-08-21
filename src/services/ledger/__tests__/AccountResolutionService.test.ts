import { accountResolutionService } from '@/src/services/ledger/resolution';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { database } from '@/src/data/database/Database';
import { AccountType, WorkplaceId } from '@/src/types/domain';

describe('AccountResolutionService', () => {
  const workplaceId = 'test-workplace-id' as WorkplaceId;

  beforeEach(async () => {
    // Reset database state before each test
    await database.write(async () => {
      await database.unsafeResetDatabase();
    });
  });

  it('handles empty training data for Bayes classifier gracefully without NaN/Infinity', async () => {
    // Verify that resolving a hint when no active accounts/vocabulary are present
    // doesn't crash or result in division by zero/NaN.
    const result = await accountResolutionService.resolve({
      sourceHint: 'Cash',
      destinationHint: 'Coffee',
      direction: 'debit',
      workplaceId,
    });

    expect(result).toBeDefined();
    expect(result.confidence).toBeLessThanOrEqual(0.4);
    expect(result.strategyUsed).toBe('default');
  });

  it('performs fuzzy matching correctly', async () => {
    // Create test accounts using repository to ensure they are created correctly
    const sourceAcc = await accountWriteRepository.create({
      workplaceId,
      name: 'HDFC Bank',
      accountType: AccountType.ASSET,
      currencyCode: 'INR',
    });

    const categoryAcc = await accountWriteRepository.create({
      workplaceId,
      name: 'Groceries',
      accountType: AccountType.EXPENSE,
      currencyCode: 'INR',
    });

    const result = await accountResolutionService.resolve({
      sourceHint: 'hdfc bank',
      destinationHint: 'groceries',
      direction: 'debit',
      workplaceId,
    });

    expect(result.sourceAccountId).toBe(sourceAcc.id);
    expect(result.categoryAccountId).toBe(categoryAcc.id);
    expect(result.strategyUsed).toBe('fuzzy');
    expect(result.confidence).toBeGreaterThan(0.85);
  });

  it('does not resolve from foreign workplace transaction history', async () => {
    // In wp-2, create accounts and journals
    const foreignWp = 'foreign-wp-id' as WorkplaceId;
    const foreignSource = await accountWriteRepository.create({
      workplaceId: foreignWp,
      name: 'Bank XYZ',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    const foreignCategory = await accountWriteRepository.create({
      workplaceId: foreignWp,
      name: 'Electric Bill',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    });

    // Create journal in wp-2 with keyword 'PowerCorp'
    await database.write(async () => {
      const journal = await database.collections.get('journals').create((j: any) => {
        j.workplaceId = foreignWp;
        j.journalDate = Date.now();
        j.description = 'PowerCorp Electric Payment';
        j.status = 'POSTED';
        j.totalAmount = 100;
        j.transactionCount = 2;
        j.currencyCode = 'USD';
        j.displayType = 'EXPENSE';
      });

      await database.collections.get('transactions').create((t: any) => {
        t.workplaceId = foreignWp;
        t.journalId = journal.id;
        t.accountId = foreignSource.id;
        t.amount = 100;
        t.transactionType = 'CREDIT';
        t.currencyCode = 'USD';
        t.transactionDate = Date.now();
      });

      await database.collections.get('transactions').create((t: any) => {
        t.workplaceId = foreignWp;
        t.journalId = journal.id;
        t.accountId = foreignCategory.id;
        t.amount = 100;
        t.transactionType = 'DEBIT';
        t.currencyCode = 'USD';
        t.transactionDate = Date.now();
      });
    });

    // In wp-1, create a generic account
    await accountWriteRepository.create({
      workplaceId,
      name: 'Cash',
      accountType: AccountType.ASSET,
      currencyCode: 'USD',
    });
    await accountWriteRepository.create({
      workplaceId,
      name: 'General Expense',
      accountType: AccountType.EXPENSE,
      currencyCode: 'USD',
    });

    // Resolve 'PowerCorp' in wp-1
    const result = await accountResolutionService.resolve({
      destinationHint: 'PowerCorp',
      direction: 'debit',
      workplaceId,
    });

    // It should not use history or foreign accounts from wp-2
    expect(result.strategyUsed).not.toBe('history');
    expect(result.sourceAccountId).not.toBe(foreignSource.id);
    expect(result.categoryAccountId).not.toBe(foreignCategory.id);
  });
});
