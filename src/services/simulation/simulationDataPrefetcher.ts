import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import { accountQueryRepository } from '@/src/data/repositories/account';
import { budgetRepository } from '@/src/data/repositories/BudgetRepository';
import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { AccountType } from '@/src/types/enums';
import { WorkplaceId } from '@/src/types/ids';
import { isLoanSubtype } from '@/src/utils/accountSubtypeUtils';
import { logger } from '@/src/utils/logger';
import { toLiabilityMetadata } from './liabilityMetadata';
import { TimeContext } from './TimeContext';
import { ScopeResolver } from '@/src/services/forward-finance/scope/ScopeResolver';
import { LiabilityMetadata } from './types';
import { getCorrespondingStatementDate, getNextDueDate } from './utils/liabilityUtils';

export async function fetchMetadata(
  lbs: { account: Account }[],
  workplaceId: WorkplaceId,
): Promise<Map<string, LiabilityMetadata>> {
  const map = new Map<string, LiabilityMetadata>();
  if (lbs.length === 0) return map;

  const ids = lbs.map(lb => lb.account.id);
  const metadataRecords = await accountQueryRepository.findMetadataByAccountIds(workplaceId, ids);

  metadataRecords.forEach(meta => {
    map.set(meta.accountId, toLiabilityMetadata(meta));
  });

  return map;
}

export async function fetchStatementValues(
  lbs: { account: Account }[],
  metadataMap: Map<string, LiabilityMetadata>,
  time: TimeContext,
  toCurrency: string,
  rateMap: Map<string, number>,
  workplaceId: WorkplaceId,
): Promise<{ statementBalances: Map<string, number>; settledSinceStatement: Map<string, number> }> {
  const balances = new Map<string, number>();
  const settledAmounts = new Map<string, number>();

  const convert = (amount: number, from: string) => {
    const fromCurrency = from || toCurrency;
    if (fromCurrency === toCurrency) {
      return Math.round((amount + Number.EPSILON) * 100) / 100;
    }
    const rate = rateMap.get(fromCurrency);
    if (rate === undefined) {
      logger.warn(
        `[SimulationDataPrefetcher] Skipping statement value in ${fromCurrency} (no FX rate to ${toCurrency})`,
      );
      return 0;
    }
    const val = amount * rate;
    return Math.round((val + Number.EPSILON) * 100) / 100;
  };

  await Promise.all(
    lbs.map(async lb => {
      const metadata = metadataMap.get(lb.account.id);
      const now = time.getStartOfToday();

      if (lb.account.accountSubtype === 'CREDIT_CARD' && metadata?.statementDay) {
        const dueDay = metadata.dueDay || AppConfig.insights.liabilityDefaultDueDay;
        const d1Date = getNextDueDate(now, dueDay);
        const s1Date = getCorrespondingStatementDate(d1Date, metadata.statementDay, dueDay);

        const [latestBalances, metrics] = await Promise.all([
          transactionRawRepository.getLatestBalancesRaw(
            workplaceId,
            [lb.account.id],
            s1Date.valueOf(),
          ),
          transactionRawRepository.getAccountPeriodMetricsRaw(
            workplaceId,
            lb.account.id,
            s1Date.valueOf(),
            now.endOf('day').valueOf(),
            lb.account.accountType,
          ),
        ]);

        const rawBal = Math.abs(latestBalances.get(lb.account.id) || 0);
        const statementBal = convert(rawBal, lb.account.currencyCode || toCurrency);
        balances.set(lb.account.id, statementBal);

        const rawSettled = metrics.totalDecrease;
        const settled = convert(rawSettled, lb.account.currencyCode || toCurrency);
        settledAmounts.set(lb.account.id, settled);
      } else if (isLoanSubtype(lb.account.accountSubtype)) {
        // For loans, calculate settlement since the previous due date
        const deductionDay =
          metadata?.dueDay || metadata?.emiDay || AppConfig.insights.liabilityFallbackDeductionDay;
        const nextDue = getNextDueDate(now, deductionDay);
        const prevDue = nextDue.subtract(1, 'month');

        // We check for any payments (totalDecrease) between prevDue and now
        const metrics = await transactionRawRepository.getAccountPeriodMetricsRaw(
          workplaceId,
          lb.account.id,
          prevDue.valueOf(),
          now.endOf('day').valueOf(),
          lb.account.accountType,
        );

        const rawSettled = metrics.totalDecrease;
        const settled = convert(rawSettled, lb.account.currencyCode || toCurrency);
        settledAmounts.set(lb.account.id, settled);
      }
    }),
  );
  return { statementBalances: balances, settledSinceStatement: settledAmounts };
}

export async function fetchJournalTransactions(
  journals: Journal[],
  workplaceId: WorkplaceId,
): Promise<Map<string, Transaction[]>> {
  const ids = journals.map(j => j.id);
  const txs =
    ids.length > 0 ? await transactionQueryRepository.findByJournals(workplaceId, ids) : [];
  const map = new Map<string, Transaction[]>();
  for (const tx of txs) {
    const list = map.get(tx.journalId) || [];
    list.push(tx);
    map.set(tx.journalId, list);
  }
  return map;
}

export async function fetchBudgetCategoryMap(
  budgets: Budget[],
  allAccounts: Account[],
  workplaceId: WorkplaceId,
): Promise<Map<string, Set<string>>> {
  const map = new Map<string, Set<string>>();
  if (budgets.length === 0) return map;

  const expenses = allAccounts.filter(a => a.accountType === AccountType.EXPENSE);

  // Batch fetch all scopes
  const allScopes = await budgetRepository.getScopesByBudgetIds(
    workplaceId,
    budgets.map(b => b.id),
  );
  const scopesByBudget = new Map<string, BudgetScope[]>();
  allScopes.forEach(s => {
    const list = scopesByBudget.get(s.budgetId) || [];
    list.push(s);
    scopesByBudget.set(s.budgetId, list);
  });

  budgets.forEach(budget => {
    const scopes = scopesByBudget.get(budget.id) || [];
    const rootScopeIds = scopes.map(s => s.accountId);
    const leafIds = ScopeResolver.resolveLeafAccountIds(rootScopeIds, expenses);
    map.set(budget.id, leafIds as Set<string>);
  });

  return map;
}
