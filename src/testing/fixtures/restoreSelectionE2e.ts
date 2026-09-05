import { generator } from '@/src/data/database/idGenerator';
import { rememberPreparedRestore } from '@/src/features/setup/pickRestoreSource';
import type { RestoreSourceOutput } from '@/src/features/setup/setupTypes';
import type { PreparedRestore } from '@/src/services/import/restore';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { readE2eLaunchConfig } from '@/src/testing/e2eLaunchArgs';
import { prepareFirstRunRestoreFixture } from './firstRunRestoreBackup';

export function e2eRestoreSelectionSources(): RestoreSourceOutput[] | undefined {
  return readE2eLaunchConfig()?.seedProfile === 'bulk-restore-selection'
    ? bulkRestoreSelectionSources()
    : undefined;
}

export function e2ePrepareRestoreSelection(): Promise<RestoreSourceOutput[]> | undefined {
  return readE2eLaunchConfig()?.seedProfile === 'settings-bulk-restore'
    ? prepareSettingsBulkRestoreSources()
    : undefined;
}

export function bulkRestoreSelectionSources(): RestoreSourceOutput[] {
  return [
    { name: 'Personal', currency: 'USD' },
    { name: 'Freelance', currency: 'EUR' },
    { name: 'Side project', currency: 'GBP' },
  ].map(({ name, currency }, index) => ({
    source: {
      uri: 'file:///e2e-bulk-restore.json',
      name: 'e2e-bulk-restore.json',
      fingerprint: `e2e-bulk-${index}`,
    },
    facts: {
      workplace: { name, icon: 'briefcase', defaultCurrencyCode: currency },
    },
    stats: { accounts: 0, journals: 0, transactions: 0, skippedTransactions: 0 },
    warnings: [],
    ...(index === 0 ? {} : { operationId: generator() as WorkplaceId }),
  }));
}

export async function prepareSettingsBulkRestoreSources(): Promise<RestoreSourceOutput[]> {
  const preparedBase = await prepareFirstRunRestoreFixture();
  return [0, 1].map((index, position) => {
    const prepared = cloneSettingsFixture(preparedBase, position);
    const operationId = position === 0 ? undefined : (generator() as WorkplaceId);
    rememberPreparedRestore(prepared, operationId);
    return {
      source: {
        uri: 'file:///e2e-settings-restore.json',
        name: 'e2e-settings-restore.json',
        fingerprint: prepared.fingerprint,
      },
      facts: {
        ...prepared.facts,
        workplace: {
          ...prepared.facts.workplace,
          name: index === 0 ? 'Imported Books' : 'Imported Books 2',
        },
      },
      stats: prepared.stats,
      warnings: prepared.warnings,
      ...(operationId ? { operationId } : {}),
    };
  });
}

function cloneSettingsFixture(prepared: PreparedRestore, index: number): PreparedRestore {
  const prefix = `settings-${index}-${generator()}`;
  const accountIds = new Map<string, AccountId>(
    prepared.canonicalData.accounts.map(account => [
      account.id,
      `${prefix}-${account.id}` as AccountId,
    ]),
  );
  const journalIds = new Map<string, JournalId>(
    prepared.canonicalData.journals.map(journal => [
      journal.id,
      `${prefix}-${journal.id}` as JournalId,
    ]),
  );
  return {
    ...prepared,
    fingerprint: `${prepared.fingerprint}:${prefix}`,
    canonicalData: {
      ...prepared.canonicalData,
      accounts: prepared.canonicalData.accounts.map(account => ({
        ...account,
        id: accountIds.get(account.id) ?? account.id,
      })),
      journals: prepared.canonicalData.journals.map(journal => ({
        ...journal,
        id: journalIds.get(journal.id) ?? journal.id,
      })),
      transactions: prepared.canonicalData.transactions.map(transaction => ({
        ...transaction,
        id: `${prefix}-${transaction.id}`,
        accountId: accountIds.get(transaction.accountId) ?? transaction.accountId,
        journalId: journalIds.get(transaction.journalId) ?? transaction.journalId,
      })),
    },
  };
}
