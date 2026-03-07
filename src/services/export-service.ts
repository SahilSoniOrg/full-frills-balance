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
import { logger } from '@/src/utils/logger';
import { preferences, UIPreferences } from '@/src/utils/preferences';
import { supportsRawSql } from '../data/database/DatabaseUtils';

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

export interface JournalExport {
  id: string;
  journalDate: string;
  description?: string;
  currencyCode: string;
  status: string;
  originalJournalId?: string;
  reversingJournalId?: string;
  totalAmount: number;
  transactionCount: number;
  displayType: string;
  plannedPaymentId?: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}

export interface TransactionExport {
  id: string;
  journalId: string;
  accountId: string;
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
  budgetId: string;
  accountId: string;
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
  accountId: string;
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
  fromAccountId: string;
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

const snakeToCamel = (str: string) => str.replace(/(_\w)/g, (m) => m[1].toUpperCase());
const DATE_COLUMN_NAMES = ['created_at', 'updated_at', 'deleted_at', 'journal_date', 'transaction_date', 'start_date', 'end_date', 'next_occurrence', 'effective_date'];

export interface ExportData {
  exportDate: string;
  version: string;
  preferences: UIPreferences;
  accounts: AccountExport[];
  journals: JournalExport[];
  transactions: TransactionExport[];
  auditLogs: AuditLogExport[];
  budgets: BudgetExport[];
  budgetScopes: BudgetScopeExport[];
  currencies: CurrencyExport[];
  exchangeRates: ExchangeRateExport[];
  accountMetadata: AccountMetadataExport[];
  plannedPayments: PlannedPaymentExport[];
  journalMetadata: JournalMetadataExport[];
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
}

function toIsoDate(value: Date | number | undefined | null): string | undefined {
  if (value === undefined || value === null) return undefined;
  const date = typeof value === 'number' ? new Date(value) : value;
  return date.toISOString();
}

class ExportService {
  private typeSafeColumns(tableSchema: any): { name: string; type: string }[] {
    const rawColumns = Array.isArray(tableSchema?.columns)
      ? tableSchema.columns
      : Object.values(tableSchema?.columns || {});
    return rawColumns as { name: string; type: string }[];
  }

  private getTableSchema(tableName: string) {
    const tables = (schema as any).tables;
    if (Array.isArray(tables)) {
      return tables.find((table) => table.name === tableName);
    }
    if (tables && typeof tables === 'object') {
      if (tables[tableName]) return tables[tableName];
      return Object.values(tables).find((table: any) => table?.name === tableName);
    }
    return undefined;
  }

  /**
   * Universal fetch and transform helper derived from database schema.
   * Generates SQL with aliasing and handles value conversions centrally.
   */
  private async fetchAndTransformTable<T extends object>(tableName: string): Promise<T[]> {
    const tableSchema = this.getTableSchema(tableName);
    if (!tableSchema) throw new Error(`Missing schema for table: ${tableName}`);

    const columns = this.typeSafeColumns(tableSchema);

    const columnNames = ['id', ...columns.map((column: any) => column.name)];

    // Identify Boolean and Date fields from schema
    const booleanFields = columns
      .filter((col: { name: string; type: string }) => col.type === 'boolean')
      .map((col: { name: string; type: string }) => snakeToCamel(col.name));

    const dateFields = columns
      .filter((col: { name: string; type: string }) => col.type === 'number' && DATE_COLUMN_NAMES.includes(col.name))
      .map((col: { name: string; type: string }) => snakeToCamel(col.name));

    let raws: Record<string, unknown>[] = [];
    if (supportsRawSql(database)) {
      const selectFields = columnNames
        .map(snake => `${snake} AS ${snakeToCamel(snake)}`)
        .join(', ');
      const sql = `SELECT ${selectFields} FROM ${tableName}`;
      raws = await transactionRawRepository.queryRaw<Record<string, unknown>>(sql);
    } else {
      const collection = (database.collections as any).get?.(tableName);
      if (!collection?.query) return [];
      const rows = await collection.query().fetch();
      raws = rows.map((row: any) => {
        const source = row?._raw ?? row;
        const mapped: Record<string, unknown> = {};
        for (const snake of columnNames) {
          const camel = snakeToCamel(snake);
          mapped[camel] = source?.[snake] !== undefined ? source[snake] : source?.[camel];
        }
        return mapped;
      });
    }

    return raws.map((raw) => {
      const transformed = { ...raw } as Record<string, any>;

      // Convert date numbers to ISO strings
      dateFields.forEach((f: string) => {
        if (transformed[f] !== undefined) {
          transformed[f] = toIsoDate(transformed[f]);
        }
      });

      // Convert 1/0 numbers to booleans
      booleanFields.forEach((f: string) => {
        if (transformed[f] !== undefined) {
          transformed[f] = Boolean(transformed[f]);
        }
      });

      return transformed as T;
    });
  }

  /**
   * Exports all data as JSON using raw SQL to bypass model instantiation overhead.
   */
  async exportToJSON(): Promise<string> {
    logger.info('[ExportService] Starting optimized JSON export...');

    try {
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
        userPreferences,
      ] = await Promise.all([
        this.fetchAndTransformTable<AccountExport>('accounts'),
        this.fetchAndTransformTable<JournalExport>('journals'),
        this.fetchAndTransformTable<TransactionExport>('transactions'),
        this.fetchAndTransformTable<AuditLogExport>('audit_logs'),
        this.fetchAndTransformTable<BudgetExport>('budgets'),
        this.fetchAndTransformTable<BudgetScopeExport>('budget_scopes'),
        this.fetchAndTransformTable<CurrencyExport>('currencies'),
        this.fetchAndTransformTable<ExchangeRateExport>('exchange_rates'),
        this.fetchAndTransformTable<AccountMetadataExport>('account_metadata'),
        this.fetchAndTransformTable<PlannedPaymentExport>('planned_payments'),
        this.fetchAndTransformTable<JournalMetadataExport>('journal_metadata'),
        preferences.loadPreferences(),
      ]);

      const exportData: ExportData = {
        exportDate: new Date().toISOString(),
        version: '1.2.0',
        preferences: userPreferences,
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
      };

      const json = JSON.stringify(exportData, null, 2);
      analytics.logExportCompleted('JSON');

      logger.info('[ExportService] Export complete', {
        accounts: exportData.accounts.length,
        journals: exportData.journals.length,
        transactions: exportData.transactions.length,
        auditLogs: exportData.auditLogs.length,
        budgets: exportData.budgets.length,
        budgetScopes: exportData.budgetScopes.length,
        currencies: exportData.currencies.length,
        exchangeRates: exportData.exchangeRates.length,
        accountMetadata: exportData.accountMetadata.length,
        plannedPayments: exportData.plannedPayments.length,
        journalMetadata: exportData.journalMetadata.length,
      });

      return json;
    } catch (error) {
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
    };
  }
}

export const exportService = new ExportService();
