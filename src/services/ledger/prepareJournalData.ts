import { AccountType, JournalDisplayType, JournalStatus } from '@/src/types/enums';
import { AccountId, WorkplaceId } from '@/src/types/ids';
import { currencyReadService } from '@/src/services/currency-read-service';
import { CreateJournalData } from '@/src/data/repositories/journal/journalWriteModule';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { assertWritable } from '@/src/services/accounts/accountReferenceGraph';
import { checkJournal, effect } from '@/src/utils/accounting/BalanceEffects';
import { journalPresenter } from '@/src/services/accounting/journalPresenter';
import { roundToPrecision } from '@/src/utils/money';

export interface PreparedJournalData {
  transactions: CreateJournalData['transactions'];
  totalAmount: number;
  displayType: JournalDisplayType;
  calculatedBalances: Map<AccountId, number | null>;
  accountsToRebuild: Set<AccountId>;
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

  const accountPrecisions = new Map<string, number>();
  await Promise.all(
    accounts.map(async acc => {
      const precision = await currencyReadService.getPrecision(acc.currencyCode);
      accountPrecisions.set(acc.id, precision);
    }),
  );
  const journalPrecision = await currencyReadService.getPrecision(data.currencyCode);

  const roundedTransactions = data.transactions.map(t => ({
    ...t,
    amount: roundToPrecision(t.amount, accountPrecisions.get(t.accountId) ?? 2),
  }));

  const validation = checkJournal(
    roundedTransactions.map(t => ({
      amount: t.amount,
      type: t.transactionType,
      exchangeRate: t.exchangeRate,
    })),
    journalPrecision,
  );

  if (!validation.isValid) {
    throw new Error(`Unbalanced journal: ${validation.imbalance}`);
  }

  const accountsToRebuild = new Set<AccountId>(accountIds);
  const calculatedBalances = new Map<AccountId, number | null>();

  const isInactive =
    data.status === JournalStatus.PLANNED ||
    data.status === JournalStatus.SKIPPED ||
    data.status === JournalStatus.PAUSED;
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

  const totalAmount = Math.max(Math.abs(validation.totalDebits), Math.abs(validation.totalCredits));
  const displayType = journalPresenter.getJournalDisplayType(roundedTransactions, accountTypes);

  return {
    transactions: roundedTransactions,
    totalAmount,
    displayType,
    calculatedBalances,
    accountsToRebuild,
  };
}
