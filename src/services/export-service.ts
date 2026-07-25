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
import {
  AccountId,
  BudgetId,
  JournalDisplayType,
  TransactionId,
  WorkplaceId,
} from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { preferences, UIPreferences } from '@/src/utils/preferences';
import { Model, TableSchema } from '@nozbe/watermelondb';
import { AppSchema } from '@nozbe/watermelondb/Schema';
import { supportsRawSql } from '../data/database/DatabaseUtils';
import { WORKPLACE_DATA_TABLES } from '@/src/services/workplace/workplaceDataTables';
import { compression } from '../utils/compression';

export interface AccountExport {
  id: string;
  name: string;
  accountType: string;
  accountSubtype?: string;
  currencyCode: string;
  parentAccountId?: string;
  description?: string;
  icon?: string;
  orderNum?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface BalanceSnapshotExport {
  id: string;
  accountId: AccountId;
  transactionId: TransactionId;
  transactionDate: string;
  absoluteBalance: number;
  transactionCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface JournalExport {
  id: string;
  journalDate: string;
  description?: string;
  notes?: string;
  currencyCode: string;
  status: string;
  originalJournalId?: string;
  reversingJournalId?: string;
  totalAmount: number;
  transactionCount: number;
  displayType: JournalDisplayType;
  plannedPaymentId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface TransactionExport {
  id: string;
  journalId: string;
  accountId: AccountId;
  amount: number;
  transactionType: string;
  currencyCode: string;
  transactionDate: string;
  notes?: string;
  exchangeRate?: number;
  runningBalance?: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface AuditLogExport {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  changes: string;
  timestamp: number;
  createdAt: string;
}

export interface BudgetExport {
  id: string;
  name: string;
  amount: number;
  currencyCode: string;
  startMonth: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetScopeExport {
  id: string;
  budgetId: BudgetId;
  accountId: AccountId;
  createdAt: string;
  updatedAt: string;
}

export interface CurrencyExport {
  id: string;
  code: string;
  symbol: string;
  name: string;
  precision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface ExchangeRateExport {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  effectiveDate: string;
  source: string;
  createdAt: string;
  updatedAt: string;
}

export interface AccountMetadataExport {
  id: string;
  accountId: AccountId;
  statementDay?: number;
  dueDay?: number;
  minimumPaymentAmount?: number;
  minimumBalanceAmount?: number;
  creditLimitAmount?: number;
  aprBps?: number;
  emiDay?: number;
  loanTenureMonths?: number;
  autopayEnabled?: boolean;
  gracePeriodDays?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JournalMetadataExport {
  id: string;
  journalId: string;
  importSource: string;
  originalSmsId?: string;
  originalSmsSender?: string;
  originalSmsBody?: string;
  metadataJson?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PlannedPaymentExport {
  id: string;
  name: string;
  description?: string;
  amount: number;
  currencyCode: string;
  fromAccountId: AccountId;
  toAccountId?: string;
  intervalN: number;
  intervalType: string;
  startDate: string;
  endDate?: string;
  nextOccurrence: string;
  status: string;
  isAutoPost: boolean;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface SmsInboxRecordExport {
  id: string;
  deviceSmsId: string;
  senderAddress: string;
  rawBody: string;
  smsDate: string;
  smsFingerprint: string;
  parseStatus: string;
  parsedAmount?: number;
  parsedCurrencyCode?: string;
  parsedMerchant?: string;
  parsedAccountSource?: string;
  referenceNumber?: string;
  direction: string;
  processingStatus: string;
  linkedJournalId?: string;
  duplicateJournalId?: string;
  duplicateConfidence?: number;
  parseConfidence?: number;
  parseReason?: string;
  metadataJson?: string;
  firstSeenAt: string;
  lastScannedAt: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TransactionAutoPostRuleExport {
  id: string;
  channelsJson?: string;
  senderMatch?: string;
  bodyMatch?: string;
  conditionsJson?: string;
  actionsJson?: string;
  priority?: number;
  sourceAccountId: AccountId;
  categoryAccountId: AccountId;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface WorkplaceExport {
  id: string;
  name: string;
  icon: string;
  defaultCurrencyCode: string;
  createdAt: string;
  updatedAt: string;
}

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

export interface ExportData {
  exportDate: string;
  version: string;
  schemaVersion: number;
  preferences: UIPreferences;
  accounts: AccountExport[];
  journals: JournalExport[];
  transactions: TransactionExport[];
  auditLogs: AuditLogExport[];
  budgets: BudgetExport[];
  budgetScopes: BudgetScopeExport[];
  accountMetadata: AccountMetadataExport[];
  plannedPayments: PlannedPaymentExport[];
  journalMetadata: JournalMetadataExport[];
  transactionAutoPostRules: TransactionAutoPostRuleExport[];
  transactionInboxRecords: SmsInboxRecordExport[];
  balanceSnapshots: BalanceSnapshotExport[];
  currencies?: CurrencyExport[];
  exchange_rates?: ExchangeRateExport[];
  balance_snapshots?: BalanceSnapshotExport[];
  workplace?: WorkplaceExport;
}

interface ExportSummary {
  accounts: number;
  journals: number;
  transactions: number;
  auditLogs: number;
  budgets: number;
  budgetScopes: number;
  currencies: number;
  exchangeRates: number;
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
    if (supportsRawSql(database)) {
      const selectFields = columnNames
        .map(snake => `${snake} AS ${snakeToCamel(snake)}`)
        .join(', ');
      //if columns contain workplaceId then add where workplace_id = ?
      let sql = `SELECT ${selectFields} FROM ${tableName}`;
      if (columnNames.includes('workplace_id')) {
        sql += ` WHERE workplace_id = ?`;
      }
      const results = await transactionRawRepository.queryRaw<Record<string, unknown>>(
        sql,
        columnNames.includes('workplace_id') ? [workplaceId] : [],
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
      const collection = (database.collections as any).get?.(tableName);
      if (!collection?.query) return [];
      const rows = await collection.query().fetch();
      raws = rows.map((row: Model) => {
        const source = (row as any)._raw ?? row;
        const mapped: Record<string, unknown> = {};
        for (const snake of columnNames) {
          const camel = snakeToCamel(snake);
          mapped[camel] = source?.[snake] !== undefined ? source[snake] : source?.[camel];
        }
        return mapped;
      });
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
          const result = await this.fetchAndTransformTable<any>(workplaceId, task.table, (p, t) => {
            tableProgress.set(task.table, p / t);
            updateGlobalProgress(`Gathering ${task.name}...`);
          });
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
        currencies,
        exchangeRates,
        balanceSnapshots,
      ] = fetchResults;

      onProgress?.('Processing preferences...', 0.53);
      const [userPreferences, workplace] = await Promise.all([
        preferences.loadPreferences(),
        database.collections.get('workplaces').find(workplaceId),
      ]);

      onProgress?.('Optimizing data structure...', 0.54);
      // Yield before heavy serialization
      await new Promise(resolve => setTimeout(resolve, 0));

      onProgress?.('Serializing metadata...', 0.55);
      await new Promise(resolve => setTimeout(resolve, 16));

      // 1. Serialize top-level metadata
      const metadataPart = JSON.stringify({
        exportDate: new Date().toISOString(),
        version: '1.4.0',
        schemaVersion: schema.version,
        preferences: userPreferences,
        workplace: workplace
          ? {
              id: workplace.id,
              name: (workplace as any).name,
              icon: (workplace as any).icon,
              defaultCurrencyCode: (workplace as any).defaultCurrencyCode,
              createdAt: (workplace as any).createdAt.toISOString(),
              updatedAt: (workplace as any).updatedAt.toISOString(),
            }
          : undefined,
      });
      // Remove trailing '}' from metadata to start stitching
      let finalJson = metadataPart.slice(0, -1);

      // 2. Serialize and stitch each major table with yields
      const tablesToStitch = [
        { key: 'accounts', data: accounts },
        { key: 'journals', data: journals },
        { key: 'transactions', data: transactions },
        { key: 'auditLogs', data: auditLogs },
        { key: 'budgets', data: budgets },
        { key: 'budgetScopes', data: budgetScopes },
        { key: 'accountMetadata', data: accountMetadata },
        { key: 'plannedPayments', data: plannedPayments },
        { key: 'journalMetadata', data: journalMetadata },
        { key: 'transactionAutoPostRules', data: transactionAutoPostRules },
        { key: 'transactionInboxRecords', data: transactionInboxRecords },
        { key: 'currencies', data: currencies },
        { key: 'exchange_rates', data: exchangeRates },
        { key: 'balance_snapshots', data: balanceSnapshots },
      ];

      let currentProgress = 0.55;
      const progressStep = 0.2 / tablesToStitch.length; // Serialization takes 20% total

      for (const table of tablesToStitch) {
        onProgress?.(`Serializing ${table.key}...`, currentProgress);
        await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI

        const chunk = JSON.stringify(table.data, (key, value) => {
          if (key === 'runningBalance' || key === 'originalSmsBody') {
            return undefined;
          }
          return value;
        });

        finalJson += `,"${table.key}":${chunk}`;
        currentProgress += progressStep;
      }

      // Close the JSON object
      finalJson += '}';
      //yield here
      await new Promise(resolve => setTimeout(resolve, 10));
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
        journalMetadata: journalMetadata.length,
        transactionAutoPostRules: transactionAutoPostRules.length,
        currencies: currencies.length,
        exchangeRates: exchangeRates.length,
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
      const collection = (database.collections as any).get?.(tableName);
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
      currencies,
      exchangeRates,
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
      getCount('currencies'),
      getCount('exchange_rates'),
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
      currencies,
      exchangeRates,
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
