import { AccountType, JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { currencyReadService } from '@/src/services/currency-read-service';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { effect } from '@/src/utils/accounting/BalanceEffects';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { roundToPrecision } from '@/src/utils/money';
import {
  evaluateJournalBalance,
  JournalBalanceError,
} from '@/src/services/accounting/journalBalanceEvaluator';
import type { JournalBalanceEvaluation } from '@/src/services/accounting/journalBalanceEvaluator';

export interface PreparedJournalData {
  transactions: CreateJournalData['transactions'];
  totalAmount: number;
  displayType: JournalDisplayType;
  calculatedBalances: Map<AccountId, number | null>;
  accountsToRebuild: Set<AccountId>;
  balanceEvaluation: JournalBalanceEvaluation;
}

export async function prepareJournalData(
  data: CreateJournalData,
  workplaceId: WorkplaceId,
): Promise<PreparedJournalData> {
  const accountIds = [...new Set(data.transactions.map(t => t.accountId))];

  // Hard invariant: every leg must have a non-empty accountId. A null/empty id
  // produces a journal that silently corrupts running_balance and is invisible
  // to the integrity scanner (WHERE account_id = ? won't match NULL rows).
  const blankLeg = data.transactions.find(t => !t.accountId);
  if (blankLeg) {
    throw new Error(
      `[prepareJournalData] All journal transactions must have a valid accountId. Got: ${JSON.stringify(blankLeg)}`,
    );
  }

  const accounts = await assertWritable(workplaceId, accountIds, '[prepareJournalData] Journal');
  const accountTypes = new Map(accounts.map(a => [a.id, a.accountType as AccountType]));
  const accountsById = new Map(accounts.map(account => [account.id, account]));

  const accountPrecisions = new Map<string, number>();
  const precisionByCurrency = new Map<string, number>();
  await Promise.all(
    accounts.map(async acc => {
      const precision = await currencyReadService.getPrecision(acc.currencyCode);
      accountPrecisions.set(acc.id, precision);
      precisionByCurrency.set(acc.currencyCode.trim().toUpperCase(), precision);
    }),
  );
  const journalPrecision = await currencyReadService.getPrecision(data.currencyCode);
  precisionByCurrency.set(data.currencyCode.trim().toUpperCase(), journalPrecision);

  const roundedTransactions = data.transactions.map(t => ({
    ...t,
    amount: roundToPrecision(t.amount, accountPrecisions.get(t.accountId) ?? 2),
  }));

  const balanceEvaluation = evaluateJournalBalance({
    journalCurrency: data.currencyCode,
    precisionByCurrency,
    lines: roundedTransactions.map((transaction, index) => ({
      id: String(index),
      accountId: transaction.accountId,
      accountCurrency: accountsById.get(transaction.accountId)?.currencyCode,
      amount: transaction.amount,
      exchangeRate: transaction.exchangeRate,
      transactionType: transaction.transactionType,
    })),
  });

  const isPosted = (data.status ?? JournalStatus.POSTED) === JournalStatus.POSTED;
  const hasInvalidLines = balanceEvaluation.issues.some(issue => issue.code !== 'unbalanced');
  const totalAmount =
    balanceEvaluation.journalTotalAmount ??
    (!isPosted && balanceEvaluation.issues[0]?.code === 'unbalanced'
      ? Math.max(balanceEvaluation.debitTotalMinorUnits, balanceEvaluation.creditTotalMinorUnits) /
        10 ** balanceEvaluation.journalPrecision
      : undefined);
  if (totalAmount === undefined || hasInvalidLines || (isPosted && !balanceEvaluation.isBalanced)) {
    throw new JournalBalanceError(
      balanceEvaluation.issues[0]?.message ?? 'Journal is not balanced',
    );
  }

  const accountsToRebuild = new Set<AccountId>(accountIds);
  const calculatedBalances = new Map<AccountId, number | null>();

  const isInactive = !isPosted;
  if (!isInactive) {
    // Parallelize fetching latest transactions for all accounts involved
    await Promise.all(
      roundedTransactions.map(async tx => {
        const latestTx = await transactionQueryRepository.findLatestForAccountBeforeDate(
          workplaceId,
          tx.accountId,
          data.journalDate,
        );
        const balance = effect(accountTypes.get(tx.accountId)!, tx.transactionType).apply(
          latestTx?.runningBalance || 0,
          tx.amount,
          accountPrecisions.get(tx.accountId) ?? 2,
        );
        calculatedBalances.set(tx.accountId, balance);
      }),
    );
  }

  const displayType = journalPresenter.getJournalDisplayType(roundedTransactions, accountTypes);

  return {
    transactions: roundedTransactions,
    totalAmount,
    displayType,
    calculatedBalances,
    accountsToRebuild,
    balanceEvaluation,
  };
}
