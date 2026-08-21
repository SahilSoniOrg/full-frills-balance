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

/**
 * Robustly parse serialized JSON string IDs or single ID string into string array.
 */
export function parseSerializedIds(serialized?: string): string[] {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized);
    if (Array.isArray(parsed)) return parsed;
    return [String(parsed)];
  } catch {
    return [serialized];
  }
}

/**
 * Calculates the next occurrence timestamp based on interval and recurrence rules.
 */
export function advanceOccurrence(
  current: number,
  intervalN: number,
  intervalType: string,
  recurrenceDay?: number,
  recurrenceMonth?: number,
): number {
  const date = new Date(current);
  date.setHours(0, 0, 0, 0);

  switch (intervalType) {
    case 'DAILY':
      date.setDate(date.getDate() + intervalN);
      break;
    case 'WEEKLY':
      date.setDate(date.getDate() + intervalN * 7);
      if (recurrenceDay !== undefined && recurrenceDay !== null) {
        const currentDay = date.getDay();
        const diff = (recurrenceDay - currentDay + 7) % 7;
        date.setDate(date.getDate() + diff);
      }
      break;
    case 'MONTHLY':
      {
        const targetDay = recurrenceDay ?? date.getDate();
        date.setDate(1);
        date.setMonth(date.getMonth() + intervalN);
        const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(targetDay, lastDayOfTargetMonth));
      }
      break;
    case 'YEARLY':
      {
        const targetMonth =
          recurrenceMonth !== undefined && recurrenceMonth !== null
            ? recurrenceMonth - 1
            : date.getMonth();
        const targetDay = recurrenceDay ?? date.getDate();
        date.setFullYear(date.getFullYear() + intervalN);
        date.setDate(1);
        date.setMonth(targetMonth);
        const lastDayOfTargetMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
        date.setDate(Math.min(targetDay, lastDayOfTargetMonth));
      }
      break;
  }
  return date.getTime();
}
