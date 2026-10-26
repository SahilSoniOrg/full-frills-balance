import { waitFor } from '@testing-library/react-native';
import { database } from '@/src/data/database/Database';
import Transaction from '@/src/data/models/Transaction';
import { TransactionObserveQueries } from '@/src/data/repositories/transaction/TransactionObserveQueries';
import { buildActiveClauses } from '@/src/data/repositories/transaction/transactionActiveClauses';
import {
  setupTwoWorkplaceLedgerFixture,
  TWO_WORKPLACE_LEDGER_ONE,
  TWO_WORKPLACE_LEDGER_TWO,
} from '@/src/testing/twoWorkplaceLedgerFixture';
import { Subscription } from 'rxjs';

describe('active transaction count observation', () => {
  let queries: TransactionObserveQueries;
  let subscriptions: Subscription[];

  beforeEach(async () => {
    await setupTwoWorkplaceLedgerFixture();
    queries = new TransactionObserveQueries();
    subscriptions = [];
  });

  afterEach(() => {
    subscriptions.forEach(subscription => subscription.unsubscribe());
    jest.restoreAllMocks();
  });

  it('shares concurrent reads, broadcasts changes, and refreshes after the last subscriber leaves', async () => {
    const transactions = database.collections.get<Transaction>('transactions');
    const [transaction] = await transactions
      .query(...buildActiveClauses(TWO_WORKPLACE_LEDGER_ONE))
      .fetch();
    const expected = await transactions
      .query(...buildActiveClauses(TWO_WORKPLACE_LEDGER_ONE))
      .fetchCount();
    const count = jest.spyOn(database.adapter.underlyingAdapter, 'count');
    const first: number[] = [];
    const second: number[] = [];
    subscriptions.push(
      queries.observeActiveCount(TWO_WORKPLACE_LEDGER_ONE).subscribe(value => first.push(value)),
    );
    subscriptions.push(
      queries.observeActiveCount(TWO_WORKPLACE_LEDGER_ONE).subscribe(value => second.push(value)),
    );
    await waitFor(() => expect([first.at(-1), second.at(-1)]).toEqual([expected, expected]));
    expect(count).toHaveBeenCalledTimes(1);

    await database.write(() =>
      transaction.update(record => {
        record.deletedAt = new Date();
      }),
    );
    await waitFor(() =>
      expect([first.at(-1), second.at(-1)]).toEqual([expected - 1, expected - 1]),
    );
    subscriptions.forEach(subscription => subscription.unsubscribe());
    count.mockClear();

    const refreshed: number[] = [];
    subscriptions.push(
      queries
        .observeActiveCount(TWO_WORKPLACE_LEDGER_ONE)
        .subscribe(value => refreshed.push(value)),
    );
    await waitFor(() => expect(refreshed).toEqual([expected - 1]));
    expect(count).toHaveBeenCalledTimes(1);
  });

  it('keeps workplaces and throttling policies separate', async () => {
    const count = jest.spyOn(database.adapter.underlyingAdapter, 'count');
    const values: number[][] = [[], [], []];
    subscriptions.push(
      queries
        .observeActiveCount(TWO_WORKPLACE_LEDGER_ONE)
        .subscribe(value => values[0].push(value)),
    );
    subscriptions.push(
      queries
        .observeActiveCount(TWO_WORKPLACE_LEDGER_ONE, false)
        .subscribe(value => values[1].push(value)),
    );
    subscriptions.push(
      queries
        .observeActiveCount(TWO_WORKPLACE_LEDGER_TWO)
        .subscribe(value => values[2].push(value)),
    );
    await waitFor(() => expect(values.every(value => value.length > 0)).toBe(true));
    expect(values[0]).toEqual(values[1]);
    expect(values[2]).toEqual([0]);
    expect(count).toHaveBeenCalledTimes(3);
  });
});
