import { nativePlugin } from '@/src/services/import/plugins/native-plugin';
import { prepareRestore } from '@/src/services/import/prepareRestore';
import type { ImportFileContext } from '@/src/services/import/types';
import type { PreparedRestore } from '@/src/services/import/restoreTypes';

/** Minimal native backup used by first-run restore publication seeding. */
export const FIRST_RUN_RESTORE_BACKUP = {
  version: '1.4.0',
  workplace: {
    name: 'Imported Books',
    icon: 'briefcase',
    defaultCurrencyCode: 'USD',
  },
  accounts: [
    {
      id: 'cash',
      name: 'Cash',
      accountType: 'ASSET',
      currencyCode: 'USD',
      icon: 'wallet',
    },
    {
      id: 'food',
      name: 'Food & Drink',
      accountType: 'EXPENSE',
      currencyCode: 'USD',
      icon: 'tag',
    },
  ],
  journals: [
    {
      id: 'j1',
      journalDate: 1704067200000,
      description: 'Lunch',
      currencyCode: 'USD',
      status: 'POSTED',
      totalAmount: 12,
      transactionCount: 2,
      displayType: 'EXPENSE',
    },
  ],
  transactions: [
    {
      id: 't1',
      accountId: 'food',
      journalId: 'j1',
      amount: 12,
      transactionType: 'DEBIT',
      currencyCode: 'USD',
      transactionDate: 1704067200000,
    },
    {
      id: 't2',
      accountId: 'cash',
      journalId: 'j1',
      amount: 12,
      transactionType: 'CREDIT',
      currencyCode: 'USD',
      transactionDate: 1704067200000,
    },
  ],
} as const;

export const FIRST_RUN_RESTORE_SOURCE_URI = 'file:///e2e-restore.json';
export const FIRST_RUN_RESTORE_SOURCE_NAME = 'e2e-restore.json';

export function firstRunRestoreFileContext(): ImportFileContext {
  const json = FIRST_RUN_RESTORE_BACKUP;
  const text = JSON.stringify(json);
  return {
    uri: FIRST_RUN_RESTORE_SOURCE_URI,
    name: FIRST_RUN_RESTORE_SOURCE_NAME,
    rawBytes: new TextEncoder().encode(text),
    text,
    json,
  };
}

export async function prepareFirstRunRestoreFixture(): Promise<PreparedRestore> {
  return prepareRestore(nativePlugin, firstRunRestoreFileContext());
}
