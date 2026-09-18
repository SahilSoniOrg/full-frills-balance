import { schema } from '@/src/data/database/schema';
import { exportRepository } from '@/src/data/repositories/ExportRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { analytics } from '@/src/services/analytics';
import {
  serializeExportPayloadFromSources,
  serializeMultiWorkplaceExport,
  type ExportWorkplaceMetadata,
  type MultiWorkplaceExportEntry,
} from '@/src/services/export/exportSerialization';
import { WORKPLACE_DATA_TABLES } from '@/src/services/workplace/workplaceDataTables';
import { WorkplaceId } from '@/src/types/ids';
import { compression } from '@/src/utils/compression';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/services/preferences';
import { fetchAndTransformTable } from './exportTableTransformer';
import { ExportSummary } from './types';

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

/**
 * Exports all data as JSON using raw SQL to bypass model instantiation overhead.
 * Returns a Base64 encoded ZIP string.
 */
export async function exportToJSON(
  workplaceId: WorkplaceId,
  onProgress?: (message: string, progress: number) => void,
): Promise<string> {
  logger.info('[ExportService] Starting optimized JSON export...');
  onProgress?.('Initializing export...', 0.05);

  try {
    const tableTasks = [...WORKPLACE_DATA_TABLES];

    const tableCounts = new Map<string, number>();
    const exportedTransactionIds = new Set<string>();
    const exportedJournalIds = new Set<string>();
    const sources = tableTasks.map(
      (task, taskIndex) =>
        [
          EXPORT_KEY_BY_TABLE[task.table] ?? task.table,
          async () => {
            const startTime = Date.now();
            onProgress?.(`Gathering ${task.name}...`, 0.05);
            let result = await fetchAndTransformTable<Record<string, unknown>>(
              workplaceId,
              task.table,
              (processed, total) =>
                onProgress?.(
                  `Gathering ${task.name}...`,
                  0.05 + ((taskIndex + processed / total) / tableTasks.length) * 0.45,
                ),
            );
            if (task.table === 'journals') {
              result.forEach(row => exportedJournalIds.add(String(row.id ?? '')));
            } else if (task.table === 'transactions') {
              result.forEach(row => exportedTransactionIds.add(String(row.id ?? '')));
            } else if (task.table === 'journal_metadata') {
              result = result.filter(
                row => typeof row.journalId === 'string' && exportedJournalIds.has(row.journalId),
              );
            } else if (task.table === 'balance_snapshots') {
              result = result.filter(
                row =>
                  typeof row.transactionId === 'string' &&
                  exportedTransactionIds.has(row.transactionId),
              );
            }
            tableCounts.set(task.table, result.length);
            logger.info(`[ExportService] Fetched ${task.name}...`, {
              count: result.length,
              timeTakenMs: Date.now() - startTime,
            });
            return result;
          },
        ] as const,
    );

    onProgress?.('Processing preferences...', 0.53);
    const [userPreferences, workplace] = await Promise.all([
      preferences.loadPreferences(),
      workplaceRepository.find(workplaceId),
    ]);

    const finalJson = await serializeExportPayloadFromSources(
      {
        exportDate: new Date().toISOString(),
        version: '1.4.0',
        schemaVersion: schema.version,
        preferences: userPreferences,
        workplacePreferences: preferences.workplace.getSnapshot(workplaceId),
        workplace: workplace
          ? {
              id: workplace.id,
              name: workplace.name,
              icon: workplace.icon,
              defaultCurrencyCode: workplace.defaultCurrencyCode,
              createdAt: workplace.createdAt.toISOString(),
              updatedAt: workplace.updatedAt.toISOString(),
            }
          : undefined,
      },
      sources,
      (message, serializationProgress) =>
        onProgress?.(message, 0.54 + serializationProgress * 0.21),
    );
    onProgress?.('Preparing ZIP archive...', 0.6);
    analytics.logExportCompleted('ZIP');

    logger.info('[ExportService] Export complete', {
      ...Object.fromEntries(tableTasks.map(task => [task.table, tableCounts.get(task.table) ?? 0])),
    });

    onProgress?.('Compressing ZIP archive...', 0.75);
    logger.info('[ExportService] Native compression started');
    const startTime = Date.now();

    const archive = await compression.createZipArchive('export', {
      'backup.json': finalJson,
    });

    const endTime = Date.now();
    logger.info('[ExportService] Native compression complete', {
      timeTakenMs: endTime - startTime,
    });

    onProgress?.('Finalizing backup...', 0.9);
    let base64Data = '';
    try {
      base64Data = archive.base64;
    } finally {
      archive.cleanup(); // Clean up temp files immediately after base64 conversion
    }

    onProgress?.('Export complete!', 1.0);
    analytics.logExportCompleted('ZIP');
    return base64Data;
  } catch (error) {
    onProgress?.('Export failed', 0.0);
    logger.error('[ExportService] Export failed', error);
    throw error;
  }
}

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
    archive.cleanup();
  }
}

/**
 * Get a summary of exportable data counts
 */
export async function getExportSummary(): Promise<ExportSummary> {
  const getCount = async (tableName: string): Promise<number> => {
    return exportRepository.countTable(tableName);
  };

  const [
    accounts,
    journals,
    transactions,
    auditLogs,
    budgets,
    budgetScopes,
    accountMetadata,
    plannedPayments,
    journalMetadata,
    transactionAutoPostRules,
    transactionInboxRecords,
    balanceSnapshots,
  ] = await Promise.all([
    getCount('accounts'),
    getCount('journals'),
    getCount('transactions'),
    getCount('audit_logs'),
    getCount('budgets'),
    getCount('budget_scopes'),
    getCount('account_metadata'),
    getCount('planned_payments'),
    getCount('journal_metadata'),
    getCount('transaction_auto_post_rules'),
    getCount('transaction_inbox_records'),
    getCount('balance_snapshots'),
  ]);

  return {
    accounts,
    journals,
    transactions,
    auditLogs,
    budgets,
    budgetScopes,
    accountMetadata,
    plannedPayments,
    journalMetadata,
    transactionAutoPostRules,
    transactionInboxRecords,
    balanceSnapshots,
  };
}

export class ExportService {
  exportToJSON = exportToJSON;
  exportWorkplacesToJSON = exportWorkplacesToJSON;
  getExportSummary = getExportSummary;
}

export const exportService = new ExportService();
