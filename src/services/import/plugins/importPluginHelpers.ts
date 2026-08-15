import { AppConfig } from '@/src/constants';
import { generator } from '@/src/data/database/idGenerator';
import { ImportedAccount } from '@/src/data/repositories/importTypes';
import { AccountId, AccountType } from '@/src/types/domain';

/**
 * Resolves or dynamically registers a system Equity account for Opening Balances or Balance Corrections.
 */
export function getOrCreateSystemEquityAccount({
  isOpeningBalance,
  currencyCode,
  categoryAccountMap,
  accountCurrencyMap,
  accountImports,
}: {
  isOpeningBalance: boolean;
  currencyCode: string;
  categoryAccountMap: Map<string, AccountId>;
  accountCurrencyMap: Map<string, string>;
  accountImports: ImportedAccount[];
}): AccountId {
  const accountConfig = isOpeningBalance
    ? AppConfig.systemAccounts.openingBalances
    : AppConfig.systemAccounts.balanceCorrections;

  const systemKey = `SYSTEM_${isOpeningBalance ? 'OPENING_BALANCE' : 'BALANCE_CORRECTION'}:::${currencyCode}`;

  let existingId = categoryAccountMap.get(systemKey);
  if (!existingId) {
    existingId = generator() as AccountId;
    categoryAccountMap.set(systemKey, existingId);
    accountCurrencyMap.set(existingId, currencyCode);

    accountImports.push({
      id: existingId,
      name: `${accountConfig.namePrefix} (${currencyCode})`,
      accountType: AccountType.EQUITY,
      currencyCode,
      description: accountConfig.description,
      icon: accountConfig.icon,
      orderNum: accountImports.length + 1,
    });
  }

  return existingId;
}

/**
 * Safely parse a date/time representation into millisecond timestamp.
 */
export function parseTimestampMs(
  value: string | number | null | undefined,
  fallbackMs = Date.now(),
): number {
  if (value === null || value === undefined || value === '') return fallbackMs;
  if (typeof value === 'number') {
    // If seconds (< 1e11), convert to milliseconds
    return value < 100000000000 ? value * 1000 : value;
  }
  const parsed = new Date(value).getTime();
  return isNaN(parsed) ? fallbackMs : parsed;
}
