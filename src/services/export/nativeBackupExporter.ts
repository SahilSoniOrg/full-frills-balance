import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { parseFundingAccountIds } from '@/src/domain/budget/fundingAccountIds';
import {
  serializeMultiWorkplaceExport,
  type ExportWorkplaceMetadata,
  type MultiWorkplaceExportEntry,
} from '@/src/services/export/exportSerialization';
import { WORKPLACE_DATA_TABLES } from '@/src/services/workplace/workplaceDataTables';
import { WorkplaceId } from '@/src/types/ids';
import { compression } from '@/src/services/files/compression';
import { preferences } from '@/src/services/preferences';
import { fetchAndTransformTable } from './exportTableTransformer';

/** v2 backup readers still expect comma-separated funding IDs. */
function fundingIdsForV2Export(raw: unknown): string {
  const ids = parseFundingAccountIds(
    typeof raw === 'string' || Array.isArray(raw) ? raw : raw == null ? '' : String(raw),
  );
  return ids.join(',');
}

const EXPORT_KEY_BY_TABLE: Record<string, string> = {
  people: 'people',
  person_accounts: 'personAccounts',
  open_items: 'openItems',
  settlement_allocations: 'settlementAllocations',
  accounts: 'accounts',
  journals: 'journals',
  transactions: 'transactions',
  audit_logs: 'auditLogs',
  budgets: 'budgets',
  budget_scopes: 'budgetScopes',
  account_metadata: 'accountMetadata',
  planned_payments: 'plannedPayments',
  journal_metadata: 'journalMetadata',
  account_matchers: 'accountMatchers',
  transaction_inbox_records: 'transactionInboxRecords',
  balance_snapshots: 'balance_snapshots',
};

/** Exports a complete, explicitly selected set of workplaces in the v2 format. */
export async function exportWorkplacesToJSON(
  workplaceIds: readonly WorkplaceId[],
  scope: 'all' | 'selected',
  onProgress?: (message: string, progress: number) => void,
): Promise<string> {
  if (workplaceIds.length === 0) throw new Error('No workplaces selected to export');
  const userPreferences = await preferences.loadPreferences();
  const workplaces = workplaceRepository;
  const entries: MultiWorkplaceExportEntry[] = [];

  for (const [index, workplaceId] of workplaceIds.entries()) {
    const workplace = await workplaces.find(workplaceId);
    if (!workplace) continue;
    const data: Record<string, readonly unknown[]> = {};
    const exportedTransactionIds = new Set<string>();
    const exportedJournalIds = new Set<string>();
    const exportTasks = WORKPLACE_DATA_TABLES.filter(task => !task.purgeOnly);
    for (const [taskIndex, task] of exportTasks.entries()) {
      let rows = await fetchAndTransformTable<Record<string, unknown>>(workplaceId, task.table);
      if (task.table === 'journals') {
        rows.forEach(row => exportedJournalIds.add(String(row.id ?? '')));
      } else if (task.table === 'transactions') {
        rows.forEach(row => exportedTransactionIds.add(String(row.id ?? '')));
      } else if (task.table === 'journal_metadata') {
        rows = rows.filter(row => exportedJournalIds.has(String(row.journalId ?? '')));
      } else if (task.table === 'balance_snapshots') {
        rows = rows.filter(row => exportedTransactionIds.has(String(row.transactionId ?? '')));
      } else if (task.table === 'budgets') {
        rows = rows.map(row => ({
          ...row,
          assetAccountIds: fundingIdsForV2Export(row.assetAccountIds),
        }));
      }
      data[EXPORT_KEY_BY_TABLE[task.table] ?? task.table] = rows;
      onProgress?.(
        `Gathering ${workplace.name}: ${task.name}...`,
        ((index + (taskIndex + 1) / exportTasks.length) / workplaceIds.length) * 0.8,
      );
    }
    const workplaceMetadata: ExportWorkplaceMetadata = {
      id: workplace.id,
      name: workplace.name,
      icon: workplace.icon,
      defaultCurrencyCode: workplace.defaultCurrencyCode,
      createdAt: workplace.createdAt.toISOString(),
      updatedAt: workplace.updatedAt.toISOString(),
    };
    entries.push({
      workplace: workplaceMetadata,
      workplacePreferences: preferences.workplace.getSnapshot(workplaceId),
      data,
    });
  }

  if (entries.length === 0) throw new Error('No workplaces are available to export');
  const payload = serializeMultiWorkplaceExport(
    {
      format: 'full-frills-backup',
      formatVersion: 2,
      exportDate: new Date().toISOString(),
      exportScope: scope,
      preferences: userPreferences,
      workplaces: entries,
    },
    onProgress,
  );
  onProgress?.('Preparing ZIP archive...', 0.96);
  const archive = await compression.createZipArchive('export', { 'backup.json': payload });
  try {
    return archive.base64;
  } finally {
    await archive.cleanup();
  }
}
