/**
 * Native Import Plugin
 *
 * Handles import of Full Frills Balance native backup format.
 * Refactored from import-service.ts to implement ImportPlugin interface.
 */

import { generator as generateId } from '@/src/data/database/idGenerator';
import { AccountType, AccountSubtype } from '@/src/data/models/Account';
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
  ImportedTransactionAutoPostRule,
  ImportedTransaction,
  ImportedTransactionInboxRecord,
} from '@/src/data/repositories/ImportRepository';

import { ImportFileContext, ImportPlugin, ParsedImportResult } from '@/src/services/import/types';
import { canonicalImportFromBatchImportData } from '@/src/services/import/canonicalImportAdapter';
import {
  mapOptionalRuleAccountId,
  sanitizeRuleActionsForImport,
} from '@/src/services/sms/ruleActionsAccountIds';
import {
  AccountId,
  BudgetId,
  EMPTY_ACCOUNT_ID,
  JournalId,
  PlannedPaymentId,
  TransactionId,
} from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { UIPreferences } from '@/src/utils/preferences';

interface NativeImportData {
  version: string;
  preferences?: Partial<UIPreferences> & {
    /** Legacy native backups stored the workplace currency in preferences. */
    defaultCurrencyCode?: string;
  };
  accounts: ImportedAccount[];
  journals: ImportedJournal[];
  transactions: ImportedTransaction[];
  auditLogs?: ImportedAuditLog[];
  budgets?: ImportedBudget[];
  budgetScopes?: ImportedBudgetScope[];
  accountMetadata?: ImportedAccountMetadata[];
  plannedPayments?: ImportedPlannedPayment[];
  journalMetadata?: ImportedJournalMetadata[];
  // Support both snake_case and camelCase for legacy compatibility
  sms_auto_post_rules?: ImportedTransactionAutoPostRule[];
  smsAutoPostRules?: ImportedTransactionAutoPostRule[];
  transactionAutoPostRules?: ImportedTransactionAutoPostRule[];
  sms_inbox_records?: ImportedTransactionInboxRecord[];
  smsInboxRecords?: ImportedTransactionInboxRecord[];
  transactionInboxRecords?: ImportedTransactionInboxRecord[];
  balanceSnapshots?: ImportedBalanceSnapshot[];
  workplace?: {
    name: string;
    icon: string;
    defaultCurrencyCode: string;
  };
}

function parseTimestamp(value?: number | string): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;

  const parsed = new Date(value).getTime();
  return Number.isNaN(parsed) ? undefined : parsed;
}

function isPresentRecord(row: { deletedAt?: unknown }): boolean {
  return row.deletedAt == null || row.deletedAt === '';
}

function addAccountId(target: Set<string>, value?: string | null): void {
  if (typeof value === 'string' && value.length > 0) {
    target.add(value);
  }
}

function autoPostRulesFromData(data: NativeImportData): ImportedTransactionAutoPostRule[] {
  return data.transactionAutoPostRules || data.smsAutoPostRules || data.sms_auto_post_rules || [];
}

/** Account IDs referenced by transactions/rules/etc that must exist after remap. */
function collectReferencedAccountIds(data: NativeImportData): Set<string> {
  const ids = new Set<string>();

  for (const account of data.accounts) {
    addAccountId(ids, account.parentAccountId);
  }
  for (const transaction of data.transactions) {
    addAccountId(ids, transaction.accountId);
  }
  for (const scope of data.budgetScopes || []) {
    addAccountId(ids, scope.accountId);
  }
  for (const metadata of data.accountMetadata || []) {
    addAccountId(ids, metadata.accountId);
    addAccountId(ids, metadata.payFromAccountId);
  }
  for (const payment of data.plannedPayments || []) {
    addAccountId(ids, payment.fromAccountId);
    addAccountId(ids, payment.toAccountId);
  }
  for (const snapshot of data.balanceSnapshots || []) {
    addAccountId(ids, snapshot.accountId);
  }
  for (const budget of data.budgets || []) {
    if (!budget.assetAccountIds) continue;
    for (const id of budget.assetAccountIds.split(',')) {
      addAccountId(ids, id.trim());
    }
  }
  // SMS auto-post rules are sanitized separately: stale account refs are cleared,
  // not recovered as placeholder accounts.

  return ids;
}

function requireMappedAccountId(
  accountMap: Map<string, AccountId>,
  originalId: string | undefined,
  context: string,
): AccountId {
  if (!originalId) {
    throw new Error(`Import mapping failed: ${context} is missing an account id`);
  }
  const mapped = accountMap.get(originalId);
  if (!mapped) {
    throw new Error(`Import mapping failed: ${context} references missing account "${originalId}"`);
  }
  return mapped;
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

  async parse(
    context: ImportFileContext,
    options: {
      defaultCurrency: string;
      onProgress?: (message: string, progress: number) => void;
    },
  ): Promise<ParsedImportResult> {
    const { defaultCurrency: fallbackCurrency, onProgress } = options;
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

    // Drop soft-deleted journals/legs from older backups. They are edit debris and
    // can reference accounts that no longer exist after prior restores.
    const activeJournals = data.journals.filter(isPresentRecord);
    const activeJournalIds = new Set(activeJournals.map(j => j.id));
    const activeTransactions = data.transactions.filter(
      t => isPresentRecord(t) && activeJournalIds.has(t.journalId),
    );
    const activeTransactionIds = new Set(activeTransactions.map(t => t.id));
    data.journals = activeJournals;
    data.transactions = activeTransactions;
    if (data.journalMetadata) {
      data.journalMetadata = data.journalMetadata.filter(meta =>
        activeJournalIds.has(meta.journalId),
      );
    }
    if (data.balanceSnapshots) {
      data.balanceSnapshots = data.balanceSnapshots.filter(snapshot =>
        activeTransactionIds.has(snapshot.transactionId),
      );
    }

    logger.info(
      `[NativePlugin] Validated file. Found ${data.accounts.length} accounts, ${data.journals.length} journals, ${data.transactions.length} transactions.`,
    );

    // ID Remapping Maps
    const accountMap = new Map<string, AccountId>();
    const journalMap = new Map<string, JournalId>();
    const transactionMap = new Map<string, TransactionId>();
    const budgetMap = new Map<string, BudgetId>();
    const plannedPaymentMap = new Map<string, PlannedPaymentId>();
    const accountCurrencyMap = new Map<string, string>(); // Optimization: avoid .find() in transaction loop

    // Pre-populate maps with new IDs
    data.accounts.forEach(acc => {
      accountMap.set(acc.id, generateId() as AccountId);
      if (acc.currencyCode) accountCurrencyMap.set(acc.id, acc.currencyCode);
    });
    data.journals.forEach(j => journalMap.set(j.id, generateId() as JournalId));
    data.transactions.forEach(t => transactionMap.set(t.id, generateId() as TransactionId));
    (data.budgets || []).forEach(b => budgetMap.set(b.id, generateId() as BudgetId));
    (data.plannedPayments || []).forEach(pp =>
      plannedPaymentMap.set(pp.id, generateId() as PlannedPaymentId),
    );

    try {
      const currencyCode =
        data.workplace?.defaultCurrencyCode || data.preferences?.defaultCurrencyCode;

      const defaultCurrencyCode = currencyCode || fallbackCurrency; // Fallback if no preferences exist

      // Recover orphaned account FKs (e.g. stale SMS rule actionsJson after a prior restore)
      // by synthesizing placeholder accounts so restore can succeed without data loss.
      const placeholderAccounts: ImportedAccount[] = [];
      const recoveredOriginalIds: string[] = [];
      for (const originalId of collectReferencedAccountIds(data)) {
        if (accountMap.has(originalId)) continue;
        const recoveredId = generateId() as AccountId;
        accountMap.set(originalId, recoveredId);
        accountCurrencyMap.set(originalId, defaultCurrencyCode);
        recoveredOriginalIds.push(originalId);
        placeholderAccounts.push({
          id: recoveredId,
          name: `Recovered account (${originalId.slice(0, 8)})`,
          accountType: AccountType.ASSET,
          accountSubtype: AccountSubtype.OTHER,
          currencyCode: defaultCurrencyCode,
          description:
            'Placeholder created during import for transactions or rules that referenced a missing account.',
        });
      }
      if (placeholderAccounts.length > 0) {
        logger.warn(
          `[NativePlugin] Created ${placeholderAccounts.length} placeholder account(s) for orphaned references`,
          { originalIds: recoveredOriginalIds },
        );
      }

      // 3. Map Data
      onProgress?.('Parsing data records...', 0.5);
      logger.info('[NativePlugin] Starting data mapping...');

      const accounts = [
        ...data.accounts.map(acc => {
          const id = accountMap.get(acc.id)!;
          const mappedCurrencyCode = acc.currencyCode || defaultCurrencyCode;

          return {
            id,
            name: acc.name,
            accountType: acc.accountType,
            accountSubtype: acc.accountSubtype,
            currencyCode: mappedCurrencyCode,
            parentAccountId: acc.parentAccountId ? accountMap.get(acc.parentAccountId) : undefined,
            description: acc.description,
            icon: acc.icon,
            orderNum: acc.orderNum,
            reconciledAt: parseTimestamp(acc.reconciledAt),
            createdAt: parseTimestamp(acc.createdAt),
            updatedAt: parseTimestamp(acc.updatedAt),
            deletedAt: parseTimestamp(acc.deletedAt),
          };
        }),
        ...placeholderAccounts,
      ];

      const journals = data.journals.map(j => {
        return {
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
        };
      });

      const transactions = data.transactions.map(t => {
        return {
          id: transactionMap.get(t.id)!,
          journalId: journalMap.get(t.journalId)!,
          accountId: requireMappedAccountId(accountMap, t.accountId, `transaction "${t.id}"`),
          amount: t.amount,
          transactionType: t.transactionType,
          currencyCode:
            t.currencyCode || accountCurrencyMap.get(t.accountId) || defaultCurrencyCode,
          transactionDate: parseTimestamp(t.transactionDate) ?? Date.now(),
          notes: t.notes,
          exchangeRate: t.exchangeRate,
          createdAt: parseTimestamp(t.createdAt),
          updatedAt: parseTimestamp(t.updatedAt),
          deletedAt: parseTimestamp(t.deletedAt),
        };
      });

      const resultData = {
        accounts,
        journals,
        transactions,
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
        budgets: (data.budgets || []).map(budget => {
          let remappedAssetAccountIds = '';
          if (budget.assetAccountIds) {
            remappedAssetAccountIds = budget.assetAccountIds
              .split(',')
              .map(id => accountMap.get(id) || id)
              .join(',');
          }
          return {
            id: budgetMap.get(budget.id)!,
            name: budget.name,
            amount: budget.amount,
            currencyCode: budget.currencyCode || defaultCurrencyCode,
            startMonth: budget.startMonth,
            active: budget.active,
            intervalType: budget.intervalType,
            intervalN: budget.intervalN,
            startDate: parseTimestamp(budget.startDate),
            recurrenceDay: budget.recurrenceDay,
            recurrenceMonth: budget.recurrenceMonth,
            assetAccountIds: remappedAssetAccountIds || undefined,
            createdAt: parseTimestamp(budget.createdAt),
            updatedAt: parseTimestamp(budget.updatedAt),
          };
        }),
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
          payFromAccountId: metadata.payFromAccountId
            ? accountMap.get(metadata.payFromAccountId)
            : undefined,
          minPaymentOnly: metadata.minPaymentOnly,
          minimumPaymentPercent: metadata.minimumPaymentPercent,
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
        transactionAutoPostRules: autoPostRulesFromData(data).map(rule => {
          const sourceAccountId = mapOptionalRuleAccountId(accountMap, rule.sourceAccountId);
          const categoryAccountId = mapOptionalRuleAccountId(accountMap, rule.categoryAccountId);
          const clearedBadRef =
            (Boolean(rule.sourceAccountId) && sourceAccountId === EMPTY_ACCOUNT_ID) ||
            (Boolean(rule.categoryAccountId) && categoryAccountId === EMPTY_ACCOUNT_ID);

          if (clearedBadRef) {
            logger.warn(
              `[NativePlugin] Cleared missing account refs on auto-post rule "${rule.id}"`,
              {
                sourceAccountId: rule.sourceAccountId,
                categoryAccountId: rule.categoryAccountId,
              },
            );
          }

          return {
            id: generateId(),
            channelsJson: rule.channelsJson,
            senderMatch: rule.senderMatch,
            bodyMatch: rule.bodyMatch,
            conditionsJson: rule.conditionsJson,
            actionsJson: sanitizeRuleActionsForImport(rule.actionsJson, {
              sourceAccountId,
              categoryAccountId,
            }),
            priority: rule.priority,
            sourceAccountId,
            categoryAccountId,
            isActive: rule.isActive,
            createdAt: parseTimestamp(rule.createdAt),
            updatedAt: parseTimestamp(rule.updatedAt),
          };
        }),
        transactionInboxRecords: (
          data.transactionInboxRecords ||
          data.smsInboxRecords ||
          data.sms_inbox_records ||
          []
        ).map(inbox => ({
          id: generateId(),
          channel: inbox.channel,
          deviceSourceId: inbox.deviceSourceId,
          senderAddress: inbox.senderAddress,
          rawBody: inbox.rawBody,
          inputDate: parseTimestamp(inbox.inputDate) ?? Date.now(),
          inputFingerprint: inbox.inputFingerprint,
          parseStatus: inbox.parseStatus,
          parsedAmount: inbox.parsedAmount,
          parsedCurrencyCode: inbox.parsedCurrencyCode,
          parsedMerchant: inbox.parsedMerchant,
          parsedAccountSource: inbox.parsedAccountSource,
          referenceNumber: inbox.referenceNumber,
          direction: inbox.direction,
          processingStatus: inbox.processingStatus,
          linkedJournalId: inbox.linkedJournalId
            ? journalMap.get(inbox.linkedJournalId)
            : undefined,
          duplicateJournalId: inbox.duplicateJournalId
            ? journalMap.get(inbox.duplicateJournalId)
            : undefined,
          duplicateConfidence: inbox.duplicateConfidence,
          parseConfidence: inbox.parseConfidence,
          parseReason: inbox.parseReason,
          metadataJson: inbox.metadataJson,
          firstSeenAt: parseTimestamp(inbox.firstSeenAt) ?? Date.now(),
          lastScannedAt: parseTimestamp(inbox.lastScannedAt) ?? Date.now(),
          processedAt: parseTimestamp(inbox.processedAt),
          createdAt: parseTimestamp(inbox.createdAt),
          updatedAt: parseTimestamp(inbox.updatedAt),
        })),
        balanceSnapshots: (data.balanceSnapshots || []).map(snapshot => ({
          id: generateId(),
          accountId: requireMappedAccountId(
            accountMap,
            snapshot.accountId,
            `balance snapshot "${snapshot.id}"`,
          ),
          transactionId: transactionMap.get(snapshot.transactionId)!,
          transactionDate: parseTimestamp(snapshot.transactionDate) ?? Date.now(),
          absoluteBalance: snapshot.absoluteBalance,
          transactionCount: snapshot.transactionCount,
          createdAt: parseTimestamp(snapshot.createdAt),
          updatedAt: parseTimestamp(snapshot.updatedAt),
        })),
      };

      logger.info('[NativePlugin] Parsing successful.');
      const canonical = canonicalImportFromBatchImportData(resultData, {
        sourceFormatVersion: data.version,
        importMetadata: {
          pluginId: 'native',
          preferences: data.preferences,
          workplace: {
            name: data.workplace?.name,
            icon: data.workplace?.icon,
            defaultCurrencyCode: currencyCode,
          },
        },
      });
      return {
        canonical,
        preferences: data.preferences,
        workplace: {
          name: data.workplace?.name,
          icon: data.workplace?.icon,
          defaultCurrencyCode: currencyCode,
        },
        stats: {
          accounts: accounts.length,
          journals: data.journals.length,
          transactions: data.transactions.length,
          budgets: data.budgets?.length || 0,
          auditLogs: data.auditLogs?.length || 0,
          plannedPayments: data.plannedPayments?.length || 0,
          skippedTransactions: 0,
        },
      };
    } catch (error) {
      logger.error('[NativePlugin] Parse failed', error);
      if (error instanceof Error && error.message.startsWith('Import mapping failed')) {
        throw error;
      }
      throw new Error('Failed to parse data');
    }
  },
};
