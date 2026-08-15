import { computeDominantTargetAccount } from '@/src/data/repositories/journal/JournalEnrichmentQueries';
import { AccountId, AccountType } from '@/src/types/domain';

describe('computeDominantTargetAccount', () => {
  it('returns target account when there is a single category account (100% consensus)', () => {
    const entries = [
      {
        accountId: 'acc-coffee' as AccountId,
        accountName: 'Coffee & Dining',
        accountType: AccountType.EXPENSE,
        count: 5,
      },
      {
        accountId: 'acc-card' as AccountId,
        accountName: 'Credit Card',
        accountType: AccountType.LIABILITY,
        count: 5,
      },
    ];

    const result = computeDominantTargetAccount(entries, 0.8);
    expect(result).toEqual({
      targetAccountId: 'acc-coffee',
      targetAccountName: 'Coffee & Dining',
      targetAccountType: AccountType.EXPENSE,
    });
  });

  it('returns dominant category when it exceeds the 80% threshold', () => {
    const entries = [
      {
        accountId: 'acc-rides' as AccountId,
        accountName: 'Rideshare',
        accountType: AccountType.EXPENSE,
        count: 8,
      },
      {
        accountId: 'acc-travel' as AccountId,
        accountName: 'Business Travel',
        accountType: AccountType.EXPENSE,
        count: 2,
      },
      {
        accountId: 'acc-card' as AccountId,
        accountName: 'Chase Card',
        accountType: AccountType.LIABILITY,
        count: 10,
      },
    ];

    // 8 / (8 + 2) = 80% -> matches
    const result = computeDominantTargetAccount(entries, 0.8);
    expect(result).toEqual({
      targetAccountId: 'acc-rides',
      targetAccountName: 'Rideshare',
      targetAccountType: AccountType.EXPENSE,
    });
  });

  it('returns empty object when multiple categories are split ambiguously (< 80%)', () => {
    const entries = [
      {
        accountId: 'acc-groceries' as AccountId,
        accountName: 'Groceries',
        accountType: AccountType.EXPENSE,
        count: 5,
      },
      {
        accountId: 'acc-personal' as AccountId,
        accountName: 'Personal Care',
        accountType: AccountType.EXPENSE,
        count: 5,
      },
      {
        accountId: 'acc-checking' as AccountId,
        accountName: 'Checking',
        accountType: AccountType.ASSET,
        count: 10,
      },
    ];

    // 5 / 10 = 50% < 80%
    const result = computeDominantTargetAccount(entries, 0.8);
    expect(result).toEqual({});
  });

  it('returns empty object when entries list is empty', () => {
    const result = computeDominantTargetAccount([]);
    expect(result).toEqual({});
  });

  it('works for income categories', () => {
    const entries = [
      {
        accountId: 'acc-salary' as AccountId,
        accountName: 'Main Salary',
        accountType: AccountType.INCOME,
        count: 10,
      },
      {
        accountId: 'acc-bank' as AccountId,
        accountName: 'Bank Checking',
        accountType: AccountType.ASSET,
        count: 10,
      },
    ];

    const result = computeDominantTargetAccount(entries, 0.8);
    expect(result).toEqual({
      targetAccountId: 'acc-salary',
      targetAccountName: 'Main Salary',
      targetAccountType: AccountType.INCOME,
    });
  });
});
