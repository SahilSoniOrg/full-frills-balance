import Account from '@/src/data/models/Account';
import Transaction from '@/src/data/models/Transaction';
import { convertAmount } from '@/src/services/currencyConversion';
import { exchangeRateService } from '@/src/services/exchange-rate-service';
import { ScopeResolver } from '@/src/services/forward-finance/scope/ScopeResolver';
import { AccountId, AccountType, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { Money } from '@/src/utils/money';
import { BudgetUsage } from './types';

/**
 * Resolve all leaf expense account IDs from the given scope accounts.
 */
export function resolveLeafExpenseAccountIds(
  scopeAccounts: (Account | null | undefined)[],
  allExpenses: Account[],
  workplaceId: WorkplaceId,
): Set<AccountId> {
  const rootExpenseIds = scopeAccounts
    .filter(
      (acc): acc is Account =>
        acc != null && acc.workplaceId === workplaceId && acc.accountType === AccountType.EXPENSE,
    )
    .map(acc => acc.id);

  const workplaceExpenses = allExpenses.filter(acc => acc.workplaceId === workplaceId);

  return ScopeResolver.resolveLeafAccountIds(rootExpenseIds, workplaceExpenses);
}

/**
 * Calculate multi-currency spend across transactions for a target budget.
 */
export async function calculateBudgetSpendFromTransactions(
  transactions: Transaction[],
  budgetAmount: number,
  budgetCurrencyCode: string,
): Promise<BudgetUsage> {
  const budgetMoney = Money.from(budgetAmount, budgetCurrencyCode);

  // Batch pre-fetch all required exchange rates in parallel to avoid sequential bridge calls
  const txCurrencies = new Set(transactions.map(t => t.currencyCode));
  txCurrencies.add(budgetMoney.currencyCode);

  await Promise.all(
    Array.from(txCurrencies).map(c => exchangeRateService.fetchRatesForBase(c).catch(() => ({}))),
  );

  let spentMoney = Money.from(0, budgetMoney.currencyCode);

  for (const tx of transactions) {
    let txAmount = tx.amount;
    if (tx.currencyCode !== budgetMoney.currencyCode) {
      const converted = await convertAmount({
        amount: tx.amount,
        fromCurrency: tx.currencyCode,
        toCurrency: budgetMoney.currencyCode,
        mode: 'historical',
        storedExchangeRate: tx.exchangeRate,
      });
      if (!converted.ok) {
        logger.warn('[BudgetReadService] FX unavailable for budget usage', {
          from: tx.currencyCode,
          to: budgetMoney.currencyCode,
          transactionId: tx.id,
        });
        continue;
      }
      txAmount = converted.amount;
    }

    const txMoney = Money.from(txAmount, budgetMoney.currencyCode);
    if (tx.transactionType === 'DEBIT') {
      spentMoney = spentMoney.add(txMoney);
    } else if (tx.transactionType === 'CREDIT') {
      spentMoney = spentMoney.subtract(txMoney);
    }
  }

  return {
    spent: spentMoney.amount,
    remaining: budgetMoney.subtract(spentMoney).amount,
    budgetAmount: budgetMoney.amount,
    usagePercent: budgetMoney.amount > 0 ? spentMoney.amount / budgetMoney.amount : 0,
  };
}
