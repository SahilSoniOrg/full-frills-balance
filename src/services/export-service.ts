/**
 * Export Service
 *
 * Handles data export in various formats.
 * Exports full app state for native backup/restore.
 */

import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AccountMetadata from '@/src/data/models/AccountMetadata';
import AuditLog from '@/src/data/models/AuditLog';
import Budget from '@/src/data/models/Budget';
import BudgetScope from '@/src/data/models/BudgetScope';
import Currency from '@/src/data/models/Currency';
import ExchangeRate from '@/src/data/models/ExchangeRate';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import { analytics } from '@/src/services/analytics-service';
import { logger } from '@/src/utils/logger';
import { preferences, UIPreferences } from '@/src/utils/preferences';

export interface AccountExport {
  id: string;
  name: string;
  accountType: string;
  accountSubcategory?: string;
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
  /**
   * Exports all data as JSON
   */
  async exportToJSON(): Promise<string> {
    logger.info('[ExportService] Starting JSON export...');

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
        database.collections.get<Account>('accounts').query().fetch(),
        database.collections.get<Journal>('journals').query().fetch(),
        database.collections.get<Transaction>('transactions').query().fetch(),
        database.collections.get<AuditLog>('audit_logs').query().fetch(),
        database.collections.get<Budget>('budgets').query().fetch(),
        database.collections.get<BudgetScope>('budget_scopes').query().fetch(),
        database.collections.get<Currency>('currencies').query().fetch(),
        database.collections.get<ExchangeRate>('exchange_rates').query().fetch(),
        database.collections.get<AccountMetadata>('account_metadata').query().fetch(),
        database.collections.get<PlannedPayment>('planned_payments').query().fetch(),
        database.collections.get<JournalMetadata>('journal_metadata').query().fetch(),
        preferences.loadPreferences(),
      ]);

      const exportData: ExportData = {
        exportDate: new Date().toISOString(),
        version: '1.2.0',
        preferences: userPreferences,
        accounts: accounts.map((a) => ({
          id: a.id,
          name: a.name,
          accountType: a.accountType,
          accountSubcategory: a.accountSubcategory,
          currencyCode: a.currencyCode,
          parentAccountId: a.parentAccountId,
          description: a.description,
          icon: a.icon,
          orderNum: a.orderNum,
          createdAt: a.createdAt.toISOString(),
          updatedAt: a.updatedAt.toISOString(),
          deletedAt: toIsoDate(a.deletedAt),
        })),
        journals: journals.map((j) => ({
          id: j.id,
          journalDate: toIsoDate(j.journalDate) as string,
          description: j.description,
          currencyCode: j.currencyCode,
          status: j.status,
          originalJournalId: j.originalJournalId,
          reversingJournalId: j.reversingJournalId,
          totalAmount: j.totalAmount,
          transactionCount: j.transactionCount,
          displayType: j.displayType,
          plannedPaymentId: j.plannedPaymentId,
          createdAt: j.createdAt.toISOString(),
          updatedAt: j.updatedAt.toISOString(),
          deletedAt: toIsoDate(j.deletedAt),
        })),
        transactions: transactions.map((t) => ({
          id: t.id,
          journalId: t.journalId,
          accountId: t.accountId,
          amount: t.amount,
          transactionType: t.transactionType,
          currencyCode: t.currencyCode,
          transactionDate: toIsoDate(t.transactionDate) as string,
          notes: t.notes,
          exchangeRate: t.exchangeRate,
          runningBalance: t.runningBalance,
          createdAt: t.createdAt.toISOString(),
          updatedAt: t.updatedAt.toISOString(),
          deletedAt: toIsoDate(t.deletedAt),
        })),
        auditLogs: auditLogs.map((log) => ({
          id: log.id,
          entityType: log.entityType,
          entityId: log.entityId,
          action: log.action,
          changes: log.changes,
          timestamp: log.timestamp,
          createdAt: log.createdAt.toISOString(),
        })),
        budgets: budgets.map((b) => ({
          id: b.id,
          name: b.name,
          amount: b.amount,
          currencyCode: b.currencyCode,
          startMonth: b.startMonth,
          active: b.active,
          createdAt: b.createdAt.toISOString(),
          updatedAt: b.updatedAt.toISOString(),
        })),
        budgetScopes: budgetScopes.map((bs) => ({
          id: bs.id,
          budgetId: bs.budget.id,
          accountId: bs.account.id,
          createdAt: bs.createdAt.toISOString(),
          updatedAt: bs.updatedAt.toISOString(),
        })),
        currencies: currencies.map((c) => ({
          id: c.id,
          code: c.code,
          symbol: c.symbol,
          name: c.name,
          precision: c.precision,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
          deletedAt: toIsoDate(c.deletedAt),
        })),
        exchangeRates: exchangeRates.map((er) => ({
          id: er.id,
          fromCurrency: er.fromCurrency,
          toCurrency: er.toCurrency,
          rate: er.rate,
          effectiveDate: toIsoDate(er.effectiveDate) as string,
          source: er.source,
          createdAt: er.createdAt.toISOString(),
          updatedAt: er.updatedAt.toISOString(),
        })),
        accountMetadata: accountMetadata.map((metadata) => ({
          id: metadata.id,
          accountId: metadata.account.id,
          statementDay: metadata.statementDay,
          dueDay: metadata.dueDay,
          minimumPaymentAmount: metadata.minimumPaymentAmount,
          minimumBalanceAmount: metadata.minimumBalanceAmount,
          creditLimitAmount: metadata.creditLimitAmount,
          aprBps: metadata.aprBps,
          emiDay: metadata.emiDay,
          loanTenureMonths: metadata.loanTenureMonths,
          autopayEnabled: metadata.autopayEnabled,
          gracePeriodDays: metadata.gracePeriodDays,
          notes: metadata.notes,
          createdAt: metadata.createdAt.toISOString(),
          updatedAt: metadata.updatedAt.toISOString(),
        })),
        plannedPayments: plannedPayments.map((pp) => ({
          id: pp.id,
          name: pp.name,
          description: pp.description,
          amount: pp.amount,
          currencyCode: pp.currencyCode,
          fromAccountId: pp.fromAccountId,
          toAccountId: pp.toAccountId,
          intervalN: pp.intervalN,
          intervalType: pp.intervalType,
          startDate: new Date(pp.startDate).toISOString(),
          endDate: toIsoDate(pp.endDate),
          nextOccurrence: new Date(pp.nextOccurrence).toISOString(),
          status: pp.status,
          isAutoPost: pp.isAutoPost,
          createdAt: pp.createdAt.toISOString(),
          updatedAt: pp.updatedAt.toISOString(),
          deletedAt: toIsoDate(pp.deletedAt),
        })),
        journalMetadata: journalMetadata.map((meta) => ({
          id: meta.id,
          journalId: meta.journal.id, // Using .id directly over relation since export doesn't strictly need fetched relation objects
          importSource: meta.importSource,
          originalSmsId: meta.originalSmsId,
          originalSmsSender: meta.originalSmsSender,
          originalSmsBody: meta.originalSmsBody,
          metadataJson: meta.metadataJson,
          createdAt: meta.createdAt.toISOString(),
          updatedAt: meta.updatedAt.toISOString(),
        })),
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
      database.collections.get<Account>('accounts').query().fetchCount(),
      database.collections.get<Journal>('journals').query().fetchCount(),
      database.collections.get<Transaction>('transactions').query().fetchCount(),
      database.collections.get<AuditLog>('audit_logs').query().fetchCount(),
      database.collections.get<Budget>('budgets').query().fetchCount(),
      database.collections.get<BudgetScope>('budget_scopes').query().fetchCount(),
      database.collections.get<Currency>('currencies').query().fetchCount(),
      database.collections.get<ExchangeRate>('exchange_rates').query().fetchCount(),
      database.collections.get<AccountMetadata>('account_metadata').query().fetchCount(),
      database.collections.get<PlannedPayment>('planned_payments').query().fetchCount(),
      database.collections.get<JournalMetadata>('journal_metadata').query().fetchCount(),
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
