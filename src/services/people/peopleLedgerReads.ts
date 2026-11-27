import type Account from '@/src/data/models/Account';
import { transactionRawRebuildQueries } from '@/src/data/repositories/raw/TransactionRawRebuildQueries';
import { getCurrencyPrecision } from '@/src/domain/money/currencyPrecision';
import { roundToPrecision } from '@/src/domain/money/money';
import type { WorkplaceId } from '@/src/types/ids';
import { AccountType } from '@/src/types/enums';

export function personAccountRole(accountType: AccountType) {
  switch (accountType) {
    case AccountType.ASSET:
      return 'receivable';
    case AccountType.LIABILITY:
      return 'payable';
    case AccountType.EXPENSE:
      return 'expense';
    case AccountType.INCOME:
      return 'income';
    default:
      return undefined;
  }
}

export function debtAccountRole(accountType: AccountType) {
  const role = personAccountRole(accountType);
  return role === 'receivable' || role === 'payable' ? role : undefined;
}

/** Use posted transaction facts for writes even while their running balances are being rebuilt. */
export async function readPersonLedgerBalance(
  workplaceId: WorkplaceId,
  account: Pick<Account, 'id' | 'accountType' | 'currencyCode'>,
  precisionByCurrency: ReadonlyMap<string, number>,
) {
  const precision =
    precisionByCurrency.get(account.currencyCode) ?? getCurrencyPrecision(account.currencyCode);
  return roundToPrecision(
    await transactionRawRebuildQueries.getAccountSumRaw(
      workplaceId,
      account.id,
      Number.MAX_SAFE_INTEGER,
      account.accountType,
    ),
    precision,
  );
}
