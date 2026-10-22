import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { exportRepository } from '@/src/data/repositories/ExportRepository';
import {
  serializeMultiWorkplaceExport,
  type ExportWorkplaceMetadata,
  type MultiWorkplaceExportEntry,
} from '@/src/services/export/exportSerialization';
import { WORKPLACE_DATA_TABLES } from '@/src/services/workplace/workplaceDataTables';
import { WorkplaceId } from '@/src/types/ids';
import { compression } from '@/src/utils/compression';
import { preferences } from '@/src/services/preferences';
import type { WorkplacePreferences } from '@/src/services/preferences/workplaceTypes';
import { fetchAndTransformTable } from './exportTableTransformer';

const EXPORT_KEY_BY_TABLE: Record<string, string> = {
  accounts: 'accounts',
  journals: 'journals',
  transactions: 'transactions',
  audit_logs: 'auditLogs',
  budgets: 'budgets',
  budget_scopes: 'budgetScopes',
  account_metadata: 'accountMetadata',
  planned_payments: 'plannedPayments',
  journal_metadata: 'journalMetadata',
  transaction_auto_post_rules: 'transactionAutoPostRules',
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
  const entries = await captureWorkplaces(workplaceIds, onProgress);

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
  // Compression and file I/O run after the reader releases queued accounting writes.
  onProgress?.('Preparing ZIP archive...', 0.96);
  const archive = await compression.createZipArchive('export', { 'backup.json': payload });
  try {
    return archive.base64;
  } finally {
    archive.cleanup();
  }
}

async function captureWorkplaces(
  workplaceIds: readonly WorkplaceId[],
  onProgress?: (message: string, progress: number) => void,
): Promise<MultiWorkplaceExportEntry[]> {
  const entries: MultiWorkplaceExportEntry[] = [];
  // MMKV is outside the database reader. Copy each preference bag once rather than retain it.
  const preferenceCopies = new Map(
    workplaceIds.map((id): [WorkplaceId, WorkplacePreferences] => {
      const source = preferences.workplace.getSnapshot(id);
      return [
        id,
        {
          ...source,
          dismissedPatternIds: [...source.dismissedPatternIds],
          ...(source.lastDateRange ? { lastDateRange: { ...source.lastDateRange } } : {}),
        },
      ];
    }),
  );

  for (const [index, workplaceId] of workplaceIds.entries()) {
    const entry = await exportRepository.captureConsistently(async () => {
      const workplace = await workplaceRepository.find(workplaceId);
      if (!workplace) return null;
      const data: Record<string, readonly unknown[]> = {};
      const exportedTransactionIds = new Set<string>();
      const exportedJournalIds = new Set<string>();
      for (const [taskIndex, task] of WORKPLACE_DATA_TABLES.entries()) {
        let rows = await fetchAndTransformTable<Record<string, unknown>>(workplaceId, task.table);
        if (task.table === 'journals') {
          rows.forEach(row => exportedJournalIds.add(String(row.id ?? '')));
        } else if (task.table === 'transactions') {
          rows.forEach(row => exportedTransactionIds.add(String(row.id ?? '')));
        } else if (task.table === 'journal_metadata') {
          rows = rows.filter(row => exportedJournalIds.has(String(row.journalId ?? '')));
        } else if (task.table === 'balance_snapshots') {
          rows = rows.filter(row => exportedTransactionIds.has(String(row.transactionId ?? '')));
        }
        data[EXPORT_KEY_BY_TABLE[task.table] ?? task.table] = rows;
        onProgress?.(
          `Gathering ${workplace.name}: ${task.name}...`,
          ((index + (taskIndex + 1) / WORKPLACE_DATA_TABLES.length) / workplaceIds.length) * 0.8,
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
      return {
        workplace: workplaceMetadata,
        workplacePreferences: preferenceCopies.get(workplaceId),
        data,
      };
    });
    if (entry) entries.push(entry);
  }

  return entries;
}
