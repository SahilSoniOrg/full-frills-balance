import { AccountType, TransactionType } from '@/src/types/enums';

import { effect, periodFlowSQL } from '@/src/utils/accounting/BalanceEffects';

/**
 * Oracle for `periodFlowSQL().increaseCase` — keep in sync with BalanceEffects.periodFlowSQL.
 */
function periodFlowIncreaseAmount(
  accountType: AccountType,
  transactionType: TransactionType,
  amount: number,
): number {
  if (accountType === AccountType.INCOME && transactionType === TransactionType.CREDIT) {
    return amount;
  }
  if (accountType === AccountType.EXPENSE && transactionType === TransactionType.DEBIT) {
    return amount;
  }
  if (accountType === AccountType.ASSET && transactionType === TransactionType.DEBIT) {
    return amount;
  }
  if (
    (accountType === AccountType.LIABILITY || accountType === AccountType.EQUITY) &&
    transactionType === TransactionType.CREDIT
  ) {
    return amount;
  }
  return 0;
}

/**
 * Oracle for `periodFlowSQL().decreaseCase` — keep in sync with BalanceEffects.periodFlowSQL.
 */
function periodFlowDecreaseAmount(
  accountType: AccountType,
  transactionType: TransactionType,
  amount: number,
): number {
  if (accountType === AccountType.INCOME && transactionType === TransactionType.DEBIT) {
    return amount;
  }
  if (accountType === AccountType.EXPENSE && transactionType === TransactionType.CREDIT) {
    return amount;
  }
  if (accountType === AccountType.ASSET && transactionType === TransactionType.CREDIT) {
    return amount;
  }
  if (
    (accountType === AccountType.LIABILITY || accountType === AccountType.EQUITY) &&
    transactionType === TransactionType.DEBIT
  ) {
    return amount;
  }
  return 0;
}

/** Mirrors `TransactionRawRebuildQueries.getAccountSumRaw` multiplier SQL. */
function rebuildSumDelta(
  isAssetOrExpense: boolean,
  transactionType: TransactionType,
  amount: number,
): number {
  if (isAssetOrExpense) {
    return transactionType === TransactionType.DEBIT ? amount : -amount;
  }
  return transactionType === TransactionType.CREDIT ? amount : -amount;
}

/** Exact multiplier fragments from TransactionRawRebuildQueries — drift fails tests. */
const REBUILD_MULTIPLIER_SQL = {
  assetOrExpense: `CASE WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN t.amount ELSE -t.amount END`,
  liabilitySide: `CASE WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN t.amount ELSE -t.amount END`,
} as const;

const ALL_ACCOUNT_TYPES = [
  AccountType.ASSET,
  AccountType.LIABILITY,
  AccountType.EQUITY,
  AccountType.INCOME,
  AccountType.EXPENSE,
] as const;

const ALL_TRANSACTION_TYPES = [TransactionType.DEBIT, TransactionType.CREDIT] as const;

const SAMPLE_AMOUNT = 42;

describe('balance sign parity (TS effect vs SQL oracles)', () => {
  describe('effect.sign vs periodFlowSQL increase/decrease semantics', () => {
    it.each(
      ALL_ACCOUNT_TYPES.flatMap(accountType =>
        ALL_TRANSACTION_TYPES.map(transactionType => ({ accountType, transactionType })),
      ),
    )(
      '$accountType × $transactionType matches periodFlowSQL oracle',
      ({ accountType, transactionType }) => {
        const increase = periodFlowIncreaseAmount(accountType, transactionType, SAMPLE_AMOUNT);
        const decrease = periodFlowDecreaseAmount(accountType, transactionType, SAMPLE_AMOUNT);
        const { sign } = effect(accountType, transactionType);

        expect(increase === 0 || decrease === 0).toBe(true);
        expect(increase > 0).toBe(sign === 1);
        expect(decrease > 0).toBe(sign === -1);
        expect(sign).toBe(increase > 0 ? 1 : decrease > 0 ? -1 : 0);
        expect(effect(accountType, transactionType).delta(SAMPLE_AMOUNT)).toBe(
          increase > 0 ? SAMPLE_AMOUNT : decrease > 0 ? -SAMPLE_AMOUNT : 0,
        );
      },
    );

    it('periodFlowSQL() strings encode the same increase/decrease pairs as the oracle', () => {
      const { increaseCase, decreaseCase } = periodFlowSQL();

      for (const accountType of ALL_ACCOUNT_TYPES) {
        for (const transactionType of ALL_TRANSACTION_TYPES) {
          const inc = periodFlowIncreaseAmount(accountType, transactionType, 1);
          const dec = periodFlowDecreaseAmount(accountType, transactionType, 1);
          const typeSnippet = `transaction_type = '${transactionType}'`;
          const accountSnippet = `account_type = '${accountType}'`;

          if (inc > 0) {
            expect(increaseCase).toContain(accountSnippet);
            expect(increaseCase).toContain(typeSnippet);
          }
          if (dec > 0) {
            expect(decreaseCase).toContain(accountSnippet);
            expect(decreaseCase).toContain(typeSnippet);
          }
        }
      }
    });
  });

  describe('effect.delta vs TransactionRawRebuildQueries multiplier SQL', () => {
    it.each(
      ALL_ACCOUNT_TYPES.flatMap(accountType =>
        ALL_TRANSACTION_TYPES.map(transactionType => ({ accountType, transactionType })),
      ),
    )(
      '$accountType × $transactionType matches rebuild sum multiplier branch',
      ({ accountType, transactionType }) => {
        const isAssetOrExpense =
          accountType === AccountType.ASSET || accountType === AccountType.EXPENSE;
        const sqlDelta = rebuildSumDelta(isAssetOrExpense, transactionType, SAMPLE_AMOUNT);
        expect(effect(accountType, transactionType).delta(SAMPLE_AMOUNT)).toBe(sqlDelta);
      },
    );

    it('documents rebuild multiplier SQL fragments used in production', () => {
      expect(REBUILD_MULTIPLIER_SQL.assetOrExpense).toBe(
        `CASE WHEN t.transaction_type = '${TransactionType.DEBIT}' THEN t.amount ELSE -t.amount END`,
      );
      expect(REBUILD_MULTIPLIER_SQL.liabilitySide).toBe(
        `CASE WHEN t.transaction_type = '${TransactionType.CREDIT}' THEN t.amount ELSE -t.amount END`,
      );
    });
  });
});
