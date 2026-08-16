/**
 * Export Service
 *
 * Handles data export in various formats.
 * Exports full app state for native backup/restore.
 */

import { database } from '@/src/data/database/Database';
import { schema } from '@/src/data/database/schema';
import { transactionRawRepository } from '@/src/data/repositories/TransactionRawRepository';
import { analytics } from '@/src/services/analytics-service';
import { WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences } from '@/src/utils/preferences';
import { Model, Q, TableSchema } from '@nozbe/watermelondb';
import { AppSchema } from '@nozbe/watermelondb/Schema';
import { supportsRawSql } from '../data/database/DatabaseUtils';
import { WORKPLACE_DATA_TABLES } from '@/src/services/workplace/workplaceDataTables';
import { compression } from '../utils/compression';
import Workplace from '@/src/data/models/Workplace';
import Collection from '@nozbe/watermelondb/Collection';
import { serializeExportPayload } from '@/src/services/export/exportSerialization';

const snakeToCamel = (str: string) => str.replace(/(_\w)/g, m => m[1].toUpperCase());
const DATE_COLUMN_NAMES = [
  'created_at',
  'updated_at',
  'deleted_at',
  'journal_date',
  'transaction_date',
  'start_date',
  'end_date',
  'next_occurrence',
  'effective_date',
];

/**
 * Soft-deleted journal legs (and whole journals) are edit debris. Including them in
 * backups reintroduces orphan account FKs after restores. Active state only.
 */
const EXPORT_OMIT_SOFT_DELETED_TABLES = new Set(['transactions', 'journals']);

interface ExportSummary {
  accounts: number;
  journals: number;
  transactions: number;
  auditLogs: number;
  budgets: number;
  budgetScopes: number;
  accountMetadata: number;
  plannedPayments: number;
  journalMetadata: number;
  transactionAutoPostRules: number;
  transactionInboxRecords: number;
  balanceSnapshots: number;
}

function toIsoDate(value: Date | number | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const date = typeof value === 'number' ? new Date(value) : value;
  return date.toISOString();
}

class ExportService {
  private getCollection(tableName: string): Collection<Model> | undefined {
    try {
      return database.collections.get<Model>(tableName);
    } catch {
      return undefined;
    }
  }

  private typeSafeColumns(tableSchema: TableSchema): { name: string; type: string }[] {
    const rawColumns = Array.isArray(tableSchema?.columns)
      ? tableSchema.columns
      : Object.values(tableSchema?.columns || {});
    return rawColumns as { name: string; type: string }[];
  }

  private getTableSchema(tableName: string): TableSchema | undefined {
    const tables = (schema as unknown as AppSchema).tables;
    if (Array.isArray(tables)) {
      return (tables as TableSchema[]).find(table => table.name === tableName);
    }
    if (tables && typeof tables === 'object') {
      const tableRecord = tables as unknown as Record<string, TableSchema>;
      if (tableRecord[tableName]) return tableRecord[tableName];
      return Object.values(tableRecord).find(table => table.name === tableName);
    }
    return undefined;
  }

  /**
   * Universal fetch and transform helper derived from database schema.
   * Generates SQL with aliasing and handles value conversions centrally.
   */
  private async fetchAndTransformTable<T extends object>(
    workplaceId: WorkplaceId,
    tableName: string,
    onProgress?: (processed: number, total: number) => void,
  ): Promise<T[]> {
    const tableSchema = this.getTableSchema(tableName);
    if (!tableSchema) throw new Error(`Missing schema for table: ${tableName}`);

    const columns = this.typeSafeColumns(tableSchema);

    const columnNames = ['id', ...columns.map(column => column.name)];

    // Identify Boolean and Date fields from schema
    const booleanFields = columns
      .filter((col: { name: string; type: string }) => col.type === 'boolean')
      .map((col: { name: string; type: string }) => snakeToCamel(col.name));

    const dateFields = columns
      .filter(
        (col: { name: string; type: string }) =>
          col.type === 'number' && DATE_COLUMN_NAMES.includes(col.name),
      )
      .map((col: { name: string; type: string }) => snakeToCamel(col.name));

    let raws: Record<string, unknown>[] = [];
    let useFallback = true;
    const omitSoftDeleted =
      EXPORT_OMIT_SOFT_DELETED_TABLES.has(tableName) && columnNames.includes('deleted_at');

    if (supportsRawSql(database)) {
      const selectFields = columnNames
        .map(snake => `${snake} AS ${snakeToCamel(snake)}`)
        .join(', ');
      const whereClauses: string[] = [];
      const params: (string | number)[] = [];
      if (columnNames.includes('workplace_id')) {
        whereClauses.push('workplace_id = ?');
        params.push(workplaceId);
      }
      if (omitSoftDeleted) {
        whereClauses.push('deleted_at IS NULL');
      }
      let sql = `SELECT ${selectFields} FROM ${tableName}`;
      if (whereClauses.length > 0) {
        sql += ` WHERE ${whereClauses.join(' AND ')}`;
      }
      const results = await transactionRawRepository.queryRaw<Record<string, unknown>>(
        sql,
        params,
        tableName,
      );
      if (results !== null) {
        raws = results;
        useFallback = false;
      }
    }

    if (useFallback) {
      logger.warn(
        `[ExportService] fetchAndTransformTable(${tableName}) falling back to ORM loop. Performance risk.`,
      );
      const collection = this.getCollection(tableName);
      if (!collection?.query) return [];
      const clauses = columnNames.includes('workplace_id')
        ? [Q.where('workplace_id', workplaceId)]
        : [];
      const rows = await collection.query(...clauses).fetch();
      raws = rows.map((row: Model) => {
        const source = (row._raw as unknown as Record<string, unknown>) ?? row;
        const mapped: Record<string, unknown> = {};
        for (const snake of columnNames) {
          const camel = snakeToCamel(snake);
          mapped[camel] = source?.[snake] !== undefined ? source[snake] : source?.[camel];
        }
        return mapped;
      });
    }

    if (omitSoftDeleted) {
      raws = raws.filter(raw => raw.deletedAt == null && raw.deleted_at == null);
    }

    const total = raws.length;
    return raws.map((raw, index) => {
      // Report sub-progress for large tables every 100 rows
      if (onProgress && index > 0 && index % 100 === 0) {
        onProgress(index, total);
      }

      const transformed = { ...raw } as Record<string, unknown>;

      // Convert date numbers to ISO strings
      dateFields.forEach((f: string) => {
        if (transformed[f] !== undefined) {
          transformed[f] = toIsoDate(transformed[f] as number);
        }
      });

      // Convert 1/0 numbers to booleans
      booleanFields.forEach((f: string) => {
        if (transformed[f] !== undefined) {
          transformed[f] = Boolean(transformed[f]);
        }
      });

      // Strictly filter to camelCase keys and exclude original snake_case names
      const cleaned: Record<string, unknown> = {};
      const targetKeys = columnNames.map(snakeToCamel);

      for (const key of targetKeys) {
        if (transformed[key] !== undefined) {
          cleaned[key] = transformed[key];
        }
      }

      return cleaned as T;
    });
  }

  /**
   * Exports all data as JSON using raw SQL to bypass model instantiation overhead.
   * Returns a Base64 encoded ZIP string.
   */
  async exportToJSON(
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
          const result = await this.fetchAndTransformTable<Record<string, unknown>>(
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
  async getExportSummary(): Promise<ExportSummary> {
    const getCount = async (tableName: string): Promise<number> => {
      const collection = this.getCollection(tableName);
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
}

export const exportService = new ExportService();
