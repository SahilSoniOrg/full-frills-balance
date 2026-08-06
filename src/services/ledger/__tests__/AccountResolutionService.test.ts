import { accountResolutionService } from '../AccountResolutionService';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
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
    const sourceAcc = await accountRepository.create({
      workplaceId,
      name: 'HDFC Bank',
      accountType: AccountType.ASSET,
      currencyCode: 'INR',
    });

    const categoryAcc = await accountRepository.create({
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
});
