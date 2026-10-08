import { database } from '@/src/data/database/Database';
import { accountWriteRepository } from '@/src/data/repositories/account';
import { transactionRawMetricsQueries } from '@/src/data/repositories/raw/TransactionRawMetricsQueries';
import { createJournalFixture } from '@/src/testing/journalFixtures';
import { resetDatabase } from '@/src/testing/resetDatabase';
import { AccountType, TransactionType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { balanceReadService } from '../balanceReadService';

jest.mock('@/src/services/exchange-rate-service', () => ({
  exchangeRateService: { fetchRatesForBase: jest.fn().mockResolvedValue({}) },
}));
jest.mock('@/src/services/currency-read-service', () => ({
  currencyReadService: { getAllPrecisions: jest.fn().mockResolvedValue(new Map([['USD', 2]])) },
}));

it('retains nested totals, archived balances, and lifetime counts in a scoped detail read', async () => {
  await resetDatabase();
  const workplaceId = 'subtree-balance-test' as WorkplaceId;
  const base = { workplaceId, accountType: AccountType.ASSET, currencyCode: 'USD' };
  const root = await accountWriteRepository.create({ ...base, name: 'Root' });
  const leaf = await accountWriteRepository.create({
    ...base,
    name: 'Archived leaf',
    parentAccountId: root.id,
  });
  const group = await accountWriteRepository.create({
    ...base,
    name: 'Group',
    parentAccountId: root.id,
  });
  const nested = await accountWriteRepository.create({
    ...base,
    name: 'Nested leaf',
    parentAccountId: group.id,
  });
  const unrelated = await accountWriteRepository.create({ ...base, name: 'Unrelated' });
  await database.write(() =>
    leaf.update(record => {
      record.archivedAt = new Date();
    }),
  );
  for (const [accountId, amount] of [
    [leaf.id, 250],
    [nested.id, 40],
    [unrelated.id, 1000],
  ] as const) {
    await createJournalFixture(
      {
        description: 'Historical posting',
        journalDate: new Date(2020, 0, 1).getTime(),
        currencyCode: 'USD',
        calculatedBalances: new Map([[accountId, amount]]),
        transactions: [{ accountId, amount, transactionType: TransactionType.DEBIT }],
      },
      workplaceId,
    );
  }
  const readLatest = jest.spyOn(transactionRawMetricsQueries, 'getLatestBalancesAndCounts');
  const scope = [root.id, leaf.id, group.id, nested.id];
  const balances = await balanceReadService.getAccountBalances(
    workplaceId,
    undefined,
    'USD',
    undefined,
    scope,
  );
  expect(readLatest.mock.calls[0][1].map(boundary => boundary.accountId).sort()).toEqual(
    [...scope].sort(),
  );
  expect(balances).toHaveLength(4);
  expect(balances.find(balance => balance.accountId === root.id)).toMatchObject({
    balance: 290,
    transactionCount: 2,
  });
  expect(balances.find(balance => balance.accountId === group.id)).toMatchObject({
    balance: 40,
    transactionCount: 1,
  });
  expect(balances.find(balance => balance.accountId === leaf.id)).toMatchObject({
    balance: 250,
    transactionCount: 1,
  });
});
