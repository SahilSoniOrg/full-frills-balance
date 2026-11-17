import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { journalHistoricalCaptureQueries } from '@/src/data/repositories/journal/JournalHistoricalCaptureQueries';
import { journalCaptureQueries } from '@/src/data/repositories/journal/JournalCaptureQueries';
import { withHistoricalSmsEvidence } from '@/src/domain/transaction-intelligence/historicalSmsEvidence';
import {
  listCaptureItems,
  listHistoricalPatternEvidenceEntries,
  saveCaptureCategoryDefault,
  saveHistoricalCaptureCategoryDefault,
} from '@/src/services/transaction-intelligence/captureReviewService';
import { preferences } from '@/src/services/preferences';
import {
  balancedUsdExpenseTransactions,
  createJournalFixture,
  resetJournalIntegrationWorkplace,
} from '@/src/testing/journalFixtures';
import { AccountType } from '@/src/types/enums';
import { asJournalId, asWorkplaceId, type AccountId, type JournalId } from '@/src/types/ids';
import { Q } from '@nozbe/watermelondb';

const workplaceId = asWorkplaceId('wp-1');

describe('historical capture suggestions', () => {
  let cash: AccountId;
  let food: AccountId;
  let other: AccountId;

  beforeEach(async () => {
    const accounts = await resetJournalIntegrationWorkplace();
    cash = accounts.cashAccountId;
    food = accounts.expenseAccountId;
    other = (
      await accountWriteRepository.create({
        workplaceId,
        name: 'Other',
        accountType: AccountType.EXPENSE,
        currencyCode: 'USD',
      })
    ).id;
    preferences.workplace.clear(workplaceId);
    preferences.workplace.update(workplaceId, { historicalSmsCaptureBackfillVersion: 1 });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    preferences.workplace.clear(workplaceId);
  });

  async function addEntry(index: number, merchant: string, sourceMerchant = merchant) {
    return createJournalFixture(
      {
        journalDate: index * 1000,
        currencyCode: 'USD',
        totalAmount: 10,
        transactions: balancedUsdExpenseTransactions(cash, food, 10),
        metadata: {
          importSource: 'sms',
          metadataJson: withHistoricalSmsEvidence(undefined, [
            {
              sourceId: `sms-${index}`,
              occurredAt: index * 1000,
              merchant,
              amount: 10,
              currencyCode: 'USD',
            },
            {
              sourceId: `sms-extra-${index}`,
              occurredAt: index * 1000,
              merchant: sourceMerchant,
              amount: 10,
              currencyCode: 'USD',
            },
          ]),
        },
      },
      workplaceId,
    );
  }

  async function changeCategory(journalId: JournalId) {
    const lines = await database
      .get<Transaction>('transactions')
      .query(Q.where('workplace_id', workplaceId), Q.where('journal_id', journalId))
      .fetch();
    const category = lines.find(line => line.accountId === food)!;
    await database.write(() =>
      category.update(line => {
        line.accountId = other;
      }),
    );
  }

  it('groups case variants and rejects mismatched source merchants', async () => {
    const first = await addEntry(1, 'Swiggy', 'SWIGGY');
    const second = await addEntry(2, 'swiggy');
    await addEntry(3, 'Swiggy', 'Different merchant');

    const patterns = await journalHistoricalCaptureQueries.listCategoryPatterns(workplaceId);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].journalIds).toEqual([second.id, first.id]);
    expect(patterns[0].categories).toEqual([
      { accountId: food, name: 'Food', color: null, icon: null, journalCount: 2 },
    ]);
    expect(
      await journalHistoricalCaptureQueries.listPatternEvidenceEntries(
        workplaceId,
        patterns[0],
        0,
        8,
      ),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ journalId: first.id, categoryName: 'Food', sourceCount: 2 }),
        expect.objectContaining({ journalId: second.id, categoryName: 'Food', sourceCount: 2 }),
      ]),
    );
  });

  it('pages by snapshot positions and excludes a category changed after the snapshot', async () => {
    for (let index = 1; index <= 10; index++) await addEntry(index, 'Shop');
    const [pattern] = await journalHistoricalCaptureQueries.listCategoryPatterns(workplaceId);
    await changeCategory(pattern.journalIds[8]);

    const first = await journalHistoricalCaptureQueries.listPatternEvidenceEntries(
      workplaceId,
      pattern,
      0,
      8,
    );
    const second = await journalHistoricalCaptureQueries.listPatternEvidenceEntries(
      workplaceId,
      pattern,
      8,
      8,
    );
    expect(first.map(entry => entry.journalId)).toEqual(pattern.journalIds.slice(0, 8));
    expect(second.map(entry => entry.journalId)).toEqual([pattern.journalIds[9]]);
    await expect(
      saveHistoricalCaptureCategoryDefault(workplaceId, pattern.key, food),
    ).rejects.toThrow('The historical category suggestion changed');
    expect(preferences.workplace.getSnapshot(workplaceId).captureCategoryDefaults ?? []).toEqual(
      [],
    );
  });

  it('retains mixed categories and rejects names that may have been truncated', async () => {
    await addEntry(1, 'Shop');
    const changed = await addEntry(2, 'SHOP');
    await changeCategory(changed.id);
    const prefix = 'a'.repeat(200);
    await addEntry(3, `${prefix} one`);
    await addEntry(4, `${prefix} two`);
    const spacedPrefix = `${'b'.repeat(199)} `;
    await addEntry(5, `${spacedPrefix}one`);
    await addEntry(6, `${spacedPrefix}two`);
    await addEntry(7, 'İ'.repeat(101));
    await addEntry(8, 'İ'.repeat(101));

    const patterns = await journalHistoricalCaptureQueries.listCategoryPatterns(workplaceId);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].categories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ accountId: food, journalCount: 1 }),
        expect.objectContaining({ accountId: other, journalCount: 1 }),
      ]),
    );
  });

  it('accepts a merchant whose lowercased identity reaches the storage limit', async () => {
    await addEntry(1, 'İ'.repeat(100));
    await addEntry(2, 'İ'.repeat(100));
    const patterns = await journalHistoricalCaptureQueries.listCategoryPatterns(workplaceId);
    expect(patterns).toHaveLength(1);
    expect(patterns[0].key).toContain('i\u0307'.repeat(100));
  });

  it('does not replace a different saved category without explicit removal', async () => {
    await addEntry(1, 'Shop');
    await addEntry(2, 'Shop');
    const [pattern] = await journalHistoricalCaptureQueries.listCategoryPatterns(workplaceId);
    const previous = {
      merchant: 'shop',
      financialAccountId: cash,
      kind: 'expense' as const,
      currencyCode: 'USD',
      categoryAccountId: other,
    };
    preferences.workplace.update(workplaceId, { captureCategoryDefaults: [previous] });

    await expect(
      saveHistoricalCaptureCategoryDefault(workplaceId, pattern.key, food),
    ).rejects.toThrow('Remove the existing category default');
    expect(preferences.workplace.getSnapshot(workplaceId).captureCategoryDefaults).toEqual([
      previous,
    ]);
  });

  it('excludes Uncategorized from historical patterns and their mixed categories', async () => {
    await addEntry(1, 'Shop');
    await addEntry(2, 'Shop');
    const uncategorized = await addEntry(3, 'Shop');
    await changeCategory(uncategorized.id);
    preferences.workplace.update(workplaceId, {
      automaticTransactionCapture: {
        enabled: false,
        uncategorizedAccountIds: { 'expense:USD': other },
      },
    });
    const items = await listCaptureItems(workplaceId, { includeHistorical: true });
    expect(items.mixedHistoricalCategoryPatterns).toHaveLength(0);
    expect(items.historicalCategorySuggestions).toHaveLength(1);
    expect(items.historicalCategorySuggestions[0].journalIds).not.toContain(uncategorized.id);
    expect(items.historicalCategorySuggestions[0].categories).toEqual([
      { accountId: food, name: 'Food', color: null, icon: null, journalCount: 2 },
    ]);
  });

  it('rejects live category overwrites and names that cannot be persisted', async () => {
    const choice = {
      merchant: 'shop',
      financialAccountId: cash,
      kind: 'expense' as const,
      currencyCode: 'USD',
      categoryAccountId: food,
    };
    const journalId = asJournalId('captured');
    jest.spyOn(journalCaptureQueries, 'listReview').mockResolvedValue([
      {
        journalId,
        journalDate: 1000,
        totalAmount: 10,
        currencyCode: 'USD',
        reviewState: 'confirmed',
        merchantKey: 'shop',
        suggestedDefault: choice,
      },
    ]);
    const previous = { ...choice, categoryAccountId: other };
    preferences.workplace.update(workplaceId, { captureCategoryDefaults: [previous] });
    await expect(saveCaptureCategoryDefault(workplaceId, journalId, choice)).rejects.toThrow(
      'Remove the existing category default',
    );
    expect(preferences.workplace.getSnapshot(workplaceId).captureCategoryDefaults).toEqual([
      previous,
    ]);
    await expect(
      saveCaptureCategoryDefault(workplaceId, journalId, { ...choice, merchant: 'x'.repeat(201) }),
    ).rejects.toThrow('merchant name is too long');
  });

  it('uses the current Uncategorized mapping for a previously grouped pattern', async () => {
    await addEntry(1, 'Shop');
    await addEntry(2, 'Shop');
    const [pattern] = await journalHistoricalCaptureQueries.listCategoryPatterns(workplaceId);
    expect(await listHistoricalPatternEvidenceEntries(workplaceId, pattern, 0, 8)).toHaveLength(2);
    preferences.workplace.update(workplaceId, {
      automaticTransactionCapture: {
        enabled: false,
        uncategorizedAccountIds: { 'expense:USD': food },
      },
    });
    expect(await listHistoricalPatternEvidenceEntries(workplaceId, pattern, 0, 8)).toEqual([]);
  });
});
