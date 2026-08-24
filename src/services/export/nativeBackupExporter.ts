import { database } from '@/src/data/database/Database';
import { schema } from '@/src/data/database/schema';
import Workplace from '@/src/data/models/Workplace';
import { analytics } from '@/src/services/analytics';
import { serializeExportPayloadFromSources } from '@/src/services/export/exportSerialization';
import { WORKPLACE_DATA_TABLES } from '@/src/services/workplace/workplaceDataTables';
import { WorkplaceId } from '@/src/types/ids';
import { compression } from '@/src/utils/compression';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { Model } from '@nozbe/watermelondb';
import Collection from '@nozbe/watermelondb/Collection';
import { fetchAndTransformTable } from './exportTableTransformer';
import { ExportSummary } from './types';

function getCollection(tableName: string): Collection<Model> | undefined {
  try {
    return database.collections.get<Model>(tableName);
  } catch {
    return undefined;
  }
}

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
      database.collections.get<Workplace>('workplaces').find(workplaceId),
    ]);

    const finalJson = await serializeExportPayloadFromSources(
      {
        exportDate: new Date().toISOString(),
        version: '1.4.0',
        schemaVersion: schema.version,
        preferences: userPreferences,
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

/**
 * Get a summary of exportable data counts
 */
export async function getExportSummary(): Promise<ExportSummary> {
  const getCount = async (tableName: string): Promise<number> => {
    const collection = getCollection(tableName);
    if (!collection?.query) return 0;
    return collection.query().fetchCount();
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
  getExportSummary = getExportSummary;
}

export const exportService = new ExportService();
