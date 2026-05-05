/**
 * Native Import Plugin
 *
 * Handles import of Full Frills Balance native backup format.
 * Refactored from import-service.ts to implement ImportPlugin interface.
 */

import { AppConfig } from '@/src/constants';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { AuditEntityType } from '@/src/data/models/AuditLog';
import {
  ImportedAccount,
  ImportedAccountMetadata,
  ImportedAuditLog,
  ImportedBalanceSnapshot,
  ImportedBudget,
  ImportedBudgetScope,
  ImportedJournal,
  ImportedJournalMetadata,
  ImportedPlannedPayment,
  ImportedSmsAutoPostRule,
  ImportedTransaction,
  importRepository,
} from '@/src/data/repositories/ImportRepository';
import { ImportFileContext, ImportPlugin, ImportStats } from '@/src/services/import/types';
import { integrityService } from '@/src/services/integrity-service';
import { logger } from '@/src/utils/logger';
import { preferences, UIPreferences } from '@/src/utils/preferences';

interface NativeImportData {
  version: string;
  preferences?: Partial<UIPreferences>;
  accounts: ImportedAccount[];
  journals: ImportedJournal[];
  transactions: ImportedTransaction[];
  auditLogs?: ImportedAuditLog[];
  budgets?: ImportedBudget[];
  budgetScopes?: ImportedBudgetScope[];
  accountMetadata?: ImportedAccountMetadata[];
  plannedPayments?: ImportedPlannedPayment[];
  journalMetadata?: ImportedJournalMetadata[];
  smsAutoPostRules?: ImportedSmsAutoPostRule[];
  balanceSnapshots?: ImportedBalanceSnapshot[];
}

function parseTimestamp(value?: number | string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

export const nativePlugin: ImportPlugin = {
  id: 'native',
  name: 'Full Frills Backup',
  description: 'Restore from a JSON backup file created by this app.',
  icon: '⚡️',

  detect(context: ImportFileContext): boolean {
    if (!context.json || typeof context.json !== 'object') return false;

    const obj = context.json as Record<string, unknown>;

    // Native format has journals (not categories) and a version field
    const hasJournals = Array.isArray(obj.journals);
    const hasAccounts = Array.isArray(obj.accounts);
    const hasTransactions = Array.isArray(obj.transactions);
    const hasVersion = typeof obj.version === 'string';

    // Categories is the hallmark of Ivy format, not native
    const hasCategories = Array.isArray(obj.categories);

    return hasJournals && hasAccounts && hasTransactions && hasVersion && !hasCategories;
  },

  async import(
    context: ImportFileContext,
    workplaceId: string,
    onProgress?: (message: string, progress: number) => void,
  ): Promise<ImportStats> {
    logger.info('[NativePlugin] Starting import...');

    if (!context.json) {
      logger.error('[NativePlugin] No parsed JSON found in context');
      throw new Error('Invalid JSON file format');
    }
    const data: NativeImportData = context.json as NativeImportData;

    // Basic validation
    if (!data.accounts || !data.journals || !data.transactions) {
      throw new Error('Invalid export file: missing required data sections');
    }

    logger.info(
      `[NativePlugin] Validated file. Found ${data.accounts.length} accounts, ${data.journals.length} journals, ${data.transactions.length} transactions.`,
    );
    const defaultCurrencyCode = data.preferences?.defaultCurrencyCode || AppConfig.defaultCurrency;

    // ID Remapping Maps
    const accountMap = new Map<string, string>();
    const journalMap = new Map<string, string>();
    const transactionMap = new Map<string, string>();
    const budgetMap = new Map<string, string>();
    const plannedPaymentMap = new Map<string, string>();

    // Pre-populate maps with new IDs
    data.accounts.forEach(acc => accountMap.set(acc.id, generateId()));
    data.journals.forEach(j => journalMap.set(j.id, generateId()));
    data.transactions.forEach(t => transactionMap.set(t.id, generateId()));
    (data.budgets || []).forEach(b => budgetMap.set(b.id, generateId()));
    (data.plannedPayments || []).forEach(pp => plannedPaymentMap.set(pp.id, generateId()));

    try {
      // 1. Wipe existing data for this workplace
      onProgress?.('Wiping workplace data...', 0.1);
      logger.warn(`[NativePlugin] Wiping workplace ${workplaceId} for import...`);
      await integrityService.resetWorkplace(workplaceId);

      // 2. Clear and restore preferences
      onProgress?.('Restoring preferences...', 0.2);
      await preferences.restorePreferences(data.preferences);
      // Ensure the app stays locked to the workplace we are currently importing into
      preferences.setActiveWorkplaceId(workplaceId);

      // 3. Import Data in Batch
      onProgress?.('Saving data to database (this may take a while)...', 0.4);
      // Yield UI
      await new Promise(resolve => setTimeout(resolve, 0));
      logger.info('[NativePlugin] Executing batch insert...');
      // We use the provided workplaceId instead of ensuring a default one
      await importRepository.batchInsert(workplaceId, {
        accounts: data.accounts.map(acc => ({
          id: accountMap.get(acc.id)!,
          name: acc.name,
          accountType: acc.accountType,
          accountSubtype: acc.accountSubtype,
          currencyCode: acc.currencyCode || defaultCurrencyCode,
          parentAccountId: acc.parentAccountId ? accountMap.get(acc.parentAccountId) : undefined,
          description: acc.description,
          icon: acc.icon,
          orderNum: acc.orderNum,
          createdAt: parseTimestamp(acc.createdAt),
          updatedAt: parseTimestamp(acc.updatedAt),
          deletedAt: parseTimestamp(acc.deletedAt),
        })),
        journals: data.journals.map(j => ({
          id: journalMap.get(j.id)!,
          journalDate: parseTimestamp(j.journalDate) ?? Date.now(),
          description: j.description,
          notes: j.notes,
          currencyCode: j.currencyCode,
          status: j.status,
          originalJournalId: j.originalJournalId ? journalMap.get(j.originalJournalId) : undefined,
          reversingJournalId: j.reversingJournalId
            ? journalMap.get(j.reversingJournalId)
            : undefined,
          totalAmount: j.totalAmount,
          transactionCount: j.transactionCount,
          displayType: j.displayType,
          plannedPaymentId: j.plannedPaymentId
            ? plannedPaymentMap.get(j.plannedPaymentId)
            : undefined,
          createdAt: parseTimestamp(j.createdAt),
          updatedAt: parseTimestamp(j.updatedAt),
          deletedAt: parseTimestamp(j.deletedAt),
        })),
        transactions: data.transactions.map(t => ({
          id: transactionMap.get(t.id)!,
          journalId: journalMap.get(t.journalId)!,
          accountId: accountMap.get(t.accountId)!,
          amount: t.amount,
          transactionType: t.transactionType,
          currencyCode:
            t.currencyCode ||
            data.accounts.find(a => a.id === t.accountId)?.currencyCode ||
            defaultCurrencyCode,
          transactionDate: parseTimestamp(t.transactionDate) ?? Date.now(),
          notes: t.notes,
          exchangeRate: t.exchangeRate,
          createdAt: parseTimestamp(t.createdAt),
          updatedAt: parseTimestamp(t.updatedAt),
          deletedAt: parseTimestamp(t.deletedAt),
        })),
        auditLogs: (data.auditLogs || []).map(log => {
          let mappedEntityId = log.entityId;
          const type = log.entityType as AuditEntityType;
          if (type === 'account') mappedEntityId = accountMap.get(log.entityId) || log.entityId;
          else if (type === 'journal')
            mappedEntityId = journalMap.get(log.entityId) || log.entityId;
          else if (type === 'transaction')
            mappedEntityId = transactionMap.get(log.entityId) || log.entityId;

          return {
            id: generateId(),
            entityType: log.entityType,
            entityId: mappedEntityId,
            action: log.action,
            changes: log.changes,
            timestamp: log.timestamp,
            createdAt: parseTimestamp(log.createdAt),
          };
        }),
        budgets: (data.budgets || []).map(budget => ({
          id: budgetMap.get(budget.id)!,
          name: budget.name,
          amount: budget.amount,
          currencyCode: budget.currencyCode || defaultCurrencyCode,
          startMonth: budget.startMonth,
          active: budget.active,
          createdAt: parseTimestamp(budget.createdAt),
          updatedAt: parseTimestamp(budget.updatedAt),
        })),
        budgetScopes: (data.budgetScopes || []).map(scope => ({
          id: generateId(),
          budgetId: budgetMap.get(scope.budgetId)!,
          accountId: accountMap.get(scope.accountId)!,
          createdAt: parseTimestamp(scope.createdAt),
          updatedAt: parseTimestamp(scope.updatedAt),
        })),
        accountMetadata: (data.accountMetadata || []).map(metadata => ({
          id: generateId(),
          accountId: accountMap.get(metadata.accountId)!,
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
          createdAt: parseTimestamp(metadata.createdAt),
          updatedAt: parseTimestamp(metadata.updatedAt),
        })),
        plannedPayments: (data.plannedPayments || []).map(pp => ({
          id: plannedPaymentMap.get(pp.id)!,
          name: pp.name,
          description: pp.description,
          amount: pp.amount,
          currencyCode: pp.currencyCode,
          fromAccountId: accountMap.get(pp.fromAccountId)!,
          toAccountId: accountMap.get(pp.toAccountId)!,
          intervalN: pp.intervalN,
          intervalType: pp.intervalType,
          startDate: parseTimestamp(pp.startDate) ?? Date.now(),
          endDate: parseTimestamp(pp.endDate),
          nextOccurrence: parseTimestamp(pp.nextOccurrence) ?? Date.now(),
          status: pp.status,
          isAutoPost: pp.isAutoPost,
          recurrenceDay: pp.recurrenceDay,
          recurrenceMonth: pp.recurrenceMonth,
          createdAt: parseTimestamp(pp.createdAt),
          updatedAt: parseTimestamp(pp.updatedAt),
          deletedAt: parseTimestamp(pp.deletedAt),
        })),
        journalMetadata: (data.journalMetadata || []).map(meta => ({
          id: generateId(),
          journalId: journalMap.get(meta.journalId)!,
          importSource: meta.importSource,
          originalSmsId: meta.originalSmsId,
          originalSmsSender: meta.originalSmsSender,
          originalSmsBody: meta.originalSmsBody,
          metadataJson: meta.metadataJson,
          createdAt: parseTimestamp(meta.createdAt),
          updatedAt: parseTimestamp(meta.updatedAt),
        })),
        smsAutoPostRules: (data.smsAutoPostRules || []).map(rule => ({
          id: generateId(),
          senderMatch: rule.senderMatch,
          bodyMatch: rule.bodyMatch,
          conditionsJson: rule.conditionsJson,
          actionsJson: rule.actionsJson,
          priority: rule.priority,
          sourceAccountId: accountMap.get(rule.sourceAccountId)!,
          categoryAccountId: accountMap.get(rule.categoryAccountId)!,
          isActive: rule.isActive,
          createdAt: parseTimestamp(rule.createdAt),
          updatedAt: parseTimestamp(rule.updatedAt),
        })),
        balanceSnapshots: (data.balanceSnapshots || []).map(snapshot => ({
          id: generateId(),
          accountId: accountMap.get(snapshot.accountId)!,
          transactionId: transactionMap.get(snapshot.transactionId as string)!,
          transactionDate: parseTimestamp(snapshot.transactionDate as any) ?? Date.now(),
          absoluteBalance: snapshot.absoluteBalance as number,
          transactionCount: snapshot.transactionCount as number,
          createdAt: parseTimestamp(snapshot.createdAt as any),
          updatedAt: parseTimestamp(snapshot.updatedAt as any),
        })),
      });

      logger.info('[NativePlugin] Triggering integrity checks...');
      await integrityService.forceRunCheck(workplaceId, onProgress);

      onProgress?.('Finalizing import...', 0.95);
      logger.info('[NativePlugin] Import successful.');
      return {
        accounts: data.accounts.length,
        journals: data.journals.length,
        transactions: data.transactions.length,
        budgets: data.budgets?.length || 0,
        auditLogs: data.auditLogs?.length || 0,
        plannedPayments: data.plannedPayments?.length || 0,
        skippedTransactions: 0,
      };
    } catch (error) {
      logger.error('[NativePlugin] Import failed mid-process', error);
      throw new Error('Failed to import data into database');
    }
  },
};
