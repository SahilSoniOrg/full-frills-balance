import type { AccountListItemRaw } from '@/src/data/repositories/AccountRepository';
import { AccountBalance, AccountId, AccountType } from '@/src/types/domain';

type RawListRow = AccountListItemRaw | Record<string, unknown>;

/**
 * Maps a raw account-list SQL row into an AccountBalance for aggregation / display.
 */
export function mapAccountListRowToBalance(item: RawListRow, asOfDate: number): AccountBalance {
  const row = item as Record<string, unknown>;
  const accountId = (item.id || row.accountId || row.account_id) as AccountId;
  const balance = Number(item.direct_balance ?? row.directBalance ?? 0);
  const currencyCode = (item.currency_code ?? row.currencyCode) as string;
  const accountType = (item.account_type ?? row.accountType) as AccountType;
  const income = Number(
    item.periodIncrease ?? row.period_increase ?? row.monthly_income ?? row.monthlyIncome ?? 0,
  );
  const expenses = Number(
    item.periodDecrease ?? row.period_decrease ?? row.monthly_expenses ?? row.monthlyExpenses ?? 0,
  );
  const txCount = Number(item.direct_transaction_count ?? row.directTransactionCount ?? 0);

  return {
    accountId,
    balance,
    directBalance: balance,
    currencyCode: String(currencyCode),
    transactionCount: txCount,
    directTransactionCount: txCount,
    asOfDate,
    accountType,
    monthlyIncome: Math.max(0, income),
    monthlyExpenses: Math.max(0, expenses),
  };
}
