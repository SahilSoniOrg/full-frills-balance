import { AccountType } from '@/src/data/models/Account';
import { JournalStatus } from '@/src/data/models/Journal';
import { accountRepository } from '@/src/data/repositories/AccountRepository';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import { CreateJournalData } from '@/src/data/repositories/JournalRepository';
import { transactionRepository } from '@/src/data/repositories/TransactionRepository';
import { AccountId, JournalDisplayType, WorkplaceId } from '@/src/types/domain';
import { accountingService } from '@/src/utils/accountingService';
import { journalPresenter } from '@/src/utils/journalPresenter';
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
  const accounts = await accountRepository.findAllByIds(workplaceId, accountIds);
  const accountTypes = new Map(accounts.map(a => [a.id, a.accountType as AccountType]));

  const accountPrecisions = new Map<string, number>();
  await Promise.all(
    accounts.map(async acc => {
      const precision = await currencyRepository.getPrecision(acc.currencyCode);
      accountPrecisions.set(acc.id, precision);
    }),
  );
  const journalPrecision = await currencyRepository.getPrecision(data.currencyCode);

  const roundedTransactions = data.transactions.map(t => ({
    ...t,
    amount: roundToPrecision(t.amount, accountPrecisions.get(t.accountId) ?? 2),
  }));

  // Hard invariant: every leg must have a valid account. A null accountId produces
  // a 1-legged journal that silently corrupts running_balance and is invisible to
  // the integrity scanner (WHERE account_id = ? won't match NULL rows).
  const missingAccount = roundedTransactions.find(t => !t.accountId);
  if (missingAccount) {
    throw new Error(
      `[prepareJournalData] All journal transactions must have a valid accountId. Got: ${JSON.stringify(missingAccount)}`,
    );
  }

  const validation = accountingService.validateJournal(
    roundedTransactions.map(t => ({
      amount: t.amount,
      type: t.transactionType,
      exchangeRate: t.exchangeRate,
      accountCurrency: t.currencyCode,
    })),
    journalPrecision,
  );

  if (!validation.isValid) {
    throw new Error(`Unbalanced journal: ${validation.imbalance}`);
  }

  const accountsToRebuild = new Set<AccountId>(accountIds);
  const calculatedBalances = new Map<AccountId, number | null>();

  const isInactive = data.status === JournalStatus.PLANNED || data.status === JournalStatus.SKIPPED;
  if (!isInactive) {
    for (const tx of roundedTransactions) {
      const latestTx = await transactionRepository.findLatestForAccountBeforeDate(
        workplaceId,
        tx.accountId,
        data.journalDate,
      );
      const balance = accountingService.calculateNewBalance(
        latestTx?.runningBalance || 0,
        tx.amount,
        accountTypes.get(tx.accountId)!,
        tx.transactionType,
        accountPrecisions.get(tx.accountId) ?? 2,
      );
      calculatedBalances.set(tx.accountId, balance);
    }
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
