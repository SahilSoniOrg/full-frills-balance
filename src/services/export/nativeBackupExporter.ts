import { database } from '@/src/data/database/Database';
import { schema } from '@/src/data/database/schema';
import Workplace from '@/src/data/models/Workplace';
import { analytics } from '@/src/services/analytics';
import { serializeExportPayload } from '@/src/services/export/exportSerialization';
import { WORKPLACE_DATA_TABLES } from '@/src/services/workplace/workplaceDataTables';
import { WorkplaceId } from '@/src/types/domain';
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

    // Track sub-progress of each parallel task
    const tableProgress = new Map<string, number>();
    const updateGlobalProgress = (message: string) => {
      const totalProgress =
        Array.from(tableProgress.values()).reduce((a, b) => a + b, 0) / tableTasks.length;
      onProgress?.(message, 0.05 + totalProgress * 0.45); // 5% to 50%
    };

    const fetchResults = await Promise.all(
      tableTasks.map(async task => {
        const startTime = Date.now();
        const result = await fetchAndTransformTable<Record<string, unknown>>(
          workplaceId,
          task.table,
          (p, t) => {
            tableProgress.set(task.table, p / t);
            updateGlobalProgress(`Gathering ${task.name}...`);
          },
        );
        const endTime = Date.now();
        tableProgress.set(task.table, 1.0);
        updateGlobalProgress(`Gathering ${task.name}...`);

        logger.info(`[ExportService] Fetched ${task.name}...`, {
          count: result.length,
          timeTakenMs: endTime - startTime,
        });

        // Yield to event loop to allow UI to render
        await new Promise(resolve => setTimeout(resolve, 0));

        return result;
      }),
    );
    onProgress?.('Gathering workplaces...', 0.52);

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
      balanceSnapshotsRaw,
    ] = fetchResults;

    const exportedTransactionIds = new Set(
      transactions.map(row => String((row as { id?: unknown }).id ?? '')),
    );
    const exportedJournalIds = new Set(
      journals.map(row => String((row as { id?: unknown }).id ?? '')),
    );
    const balanceSnapshots = balanceSnapshotsRaw.filter(row => {
      const transactionId = (row as { transactionId?: unknown }).transactionId;
      return typeof transactionId === 'string' && exportedTransactionIds.has(transactionId);
    });
    const journalMetadataActive = journalMetadata.filter(row => {
      const journalId = (row as { journalId?: unknown }).journalId;
      return typeof journalId === 'string' && exportedJournalIds.has(journalId);
    });

    onProgress?.('Processing preferences...', 0.53);
    const [userPreferences, workplace] = await Promise.all([
      preferences.loadPreferences(),
      database.collections.get<Workplace>('workplaces').find(workplaceId),
    ]);

    const finalJson = await serializeExportPayload(
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
      [
        ['accounts', accounts],
        ['journals', journals],
        ['transactions', transactions],
        ['auditLogs', auditLogs],
        ['budgets', budgets],
        ['budgetScopes', budgetScopes],
        ['accountMetadata', accountMetadata],
        ['plannedPayments', plannedPayments],
        ['journalMetadata', journalMetadataActive],
        ['transactionAutoPostRules', transactionAutoPostRules],
        ['transactionInboxRecords', transactionInboxRecords],
        ['balance_snapshots', balanceSnapshots],
      ],
      (message, serializationProgress) =>
        onProgress?.(message, 0.54 + serializationProgress * 0.21),
    );
    onProgress?.('Preparing ZIP archive...', 0.6);
    analytics.logExportCompleted('ZIP');

    logger.info('[ExportService] Export complete', {
      accounts: accounts.length,
      journals: journals.length,
      transactions: transactions.length,
      auditLogs: auditLogs.length,
      budgets: budgets.length,
      budgetScopes: budgetScopes.length,
      accountMetadata: accountMetadata.length,
      plannedPayments: plannedPayments.length,
      journalMetadata: journalMetadataActive.length,
      transactionAutoPostRules: transactionAutoPostRules.length,
      balanceSnapshots: balanceSnapshots.length,
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
