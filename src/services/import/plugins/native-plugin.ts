import { generator as generateId } from '@/src/data/database/idGenerator';
import { toAccountType, toTransactionType } from '@/src/data/repositories/importValueParsers';
import { AccountId, BudgetId, JournalId, PlannedPaymentId, TransactionId } from '@/src/types/ids';
import {
  CanonicalAccount,
  CanonicalAccountMetadata,
  CanonicalAuditLog,
  CanonicalBalanceSnapshot,
  CanonicalBudget,
  CanonicalBudgetScope,
  CanonicalJournal,
  CanonicalJournalMetadata,
  CanonicalPlannedPayment,
  CanonicalTransaction,
  CanonicalTransactionInboxRecord,
} from '@/src/types/importContracts';

import { ImportFileContext, ImportPlugin, ParsedImportResult } from '@/src/services/import/types';
import { canonicalImportFromBatchImportData } from '@/src/services/import/canonicalImportAdapter';
import {
  buildPlaceholderAccountsForOrphans,
  remapAccountMatchersForImport,
  remapAccountMatcherSuppressions,
  remapFundingAccountIdsCsv,
  requireMappedAccountId,
} from '@/src/services/import/plugins/nativeImportAccountRemap';
import {
  remapNativeAuditLog,
  type AuditImportEntityIdMaps,
} from '@/src/services/import/plugins/nativeImportAuditRemap';
import { countAccountsVsCategories } from '@/src/utils/accountCategory';
import { logger } from '@/src/utils/logger';
import { UIPreferences } from '@/src/services/preferences';
import type { WorkplacePreferences } from '@/src/services/preferences/workplaceTypes';
import type { CaptureCategoryLine } from '@/src/domain/transaction-intelligence/captureMetadata';
import {
  remapCaptureMetadataForImport,
  remapCapturePreferencesForImport,
  remapCategoryDefaultsForImport,
} from '@/src/services/import/plugins/nativeImportCaptureRemap';
import { withoutEmailRecognitionEvidence } from '@/src/services/email/emailRecognitionEvidence';

interface NativeImportData {
  version: string;
  preferences?: Partial<UIPreferences> & {
    /** Legacy native backups stored the workplace currency in preferences. */
    defaultCurrencyCode?: string;
  };
  workplacePreferences?: Partial<WorkplacePreferences>;
  accounts: CanonicalAccount[];
  journals: CanonicalJournal[];
  transactions: CanonicalTransaction[];
  auditLogs?: CanonicalAuditLog[];
  budgets?: CanonicalBudget[];
  budgetScopes?: CanonicalBudgetScope[];
  accountMetadata?: CanonicalAccountMetadata[];
  accountMatchers?: unknown;
  plannedPayments?: CanonicalPlannedPayment[];
  journalMetadata?: CanonicalJournalMetadata[];
  sms_inbox_records?: CanonicalTransactionInboxRecord[];
  smsInboxRecords?: CanonicalTransactionInboxRecord[];
  transactionInboxRecords?: CanonicalTransactionInboxRecord[];
  balanceSnapshots?: CanonicalBalanceSnapshot[];
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
    const inboxSources =
      data.transactionInboxRecords || data.smsInboxRecords || data.sms_inbox_records || [];
    const accountMatcherMap = new Map<string, string>();
    const inboxRecordMap = new Map<string, string>();
    const auditLogMap = new Map<string, string>();
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
    inboxSources.forEach(record => inboxRecordMap.set(record.id, generateId()));
    (data.auditLogs || []).forEach(log => auditLogMap.set(log.id, generateId()));

    const remappedMatchers = remapAccountMatchersForImport(
      data.accountMatchers,
      accountMap,
      generateId,
      parseTimestamp,
    );
    for (const [oldId, newId] of remappedMatchers.idMap) accountMatcherMap.set(oldId, newId);

    const auditEntityMaps: AuditImportEntityIdMaps = {
      account: accountMap,
      journal: journalMap,
      transaction: transactionMap,
      exchange_rate: new Map(),
      budget: budgetMap,
      planned_payment: plannedPaymentMap,
      account_matcher: accountMatcherMap,
      transaction_inbox_record: inboxRecordMap,
      workplace: new Map(),
    };

    try {
      const currencyCode =
        data.workplace?.defaultCurrencyCode || data.preferences?.defaultCurrencyCode;

      const defaultCurrencyCode = currencyCode || fallbackCurrency; // Fallback if no preferences exist

      // Matcher owners are checked against accountMap above and invalid matchers are
      // dropped. They are not salvage references, so never pass raw rows to the planner.
      // Recover other orphaned account FKs by synthesizing placeholder accounts.
      const { placeholderAccounts } = buildPlaceholderAccountsForOrphans({
        data: { ...data, accountMatchers: [] },
        accountMap,
        accountCurrencyMap,
        defaultCurrencyCode,
        nextId: () => generateId() as AccountId,
      });

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
            color: acc.color,
            orderNum: acc.orderNum,
            reconciledAt: parseTimestamp(acc.reconciledAt),
            archivedAt: parseTimestamp(acc.archivedAt),
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

      const restoredAccounts = new Map(accounts.map(account => [account.id, account]));
      const restoredLinesByJournal = new Map<JournalId, CaptureCategoryLine[]>();
      for (const transaction of transactions) {
        if (transaction.deletedAt != null) continue;
        const account = restoredAccounts.get(transaction.accountId);
        if (!account) continue;
        const lines = restoredLinesByJournal.get(transaction.journalId) ?? [];
        lines.push({
          accountId: transaction.accountId,
          amount: transaction.amount,
          transactionType: toTransactionType(transaction.transactionType),
          currencyCode: transaction.currencyCode,
          accountType: toAccountType(account.accountType),
        });
        restoredLinesByJournal.set(transaction.journalId, lines);
      }

      const resultData = {
        accounts,
        journals,
        transactions,
        auditLogs: (data.auditLogs || []).map(log => {
          const remappedLog = remapNativeAuditLog(log, {
            entities: auditEntityMaps,
            auditLogs: auditLogMap,
          });
          return {
            ...remappedLog,
            id: auditLogMap.get(log.id) ?? generateId(),
            createdAt: parseTimestamp(log.createdAt),
          };
        }),
        budgets: (data.budgets || []).map(budget => {
          const remappedAssetAccountIds = budget.assetAccountIds
            ? remapFundingAccountIdsCsv(
                budget.assetAccountIds,
                accountMap,
                `budget "${budget.id}" asset account`,
              )
            : '';
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
          accountId: requireMappedAccountId(
            accountMap,
            scope.accountId,
            `budget scope for budget "${scope.budgetId}"`,
          ),
          createdAt: parseTimestamp(scope.createdAt),
          updatedAt: parseTimestamp(scope.updatedAt),
        })),
        accountMetadata: (data.accountMetadata || []).map(metadata => ({
          id: generateId(),
          accountId: requireMappedAccountId(
            accountMap,
            metadata.accountId,
            `account metadata for "${metadata.accountId}"`,
          ),
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
            ? requireMappedAccountId(
                accountMap,
                metadata.payFromAccountId,
                `account metadata pay-from for "${metadata.accountId}"`,
              )
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
          fxMode: pp.fxMode ?? undefined,
          destinationAmount: pp.destinationAmount ?? undefined,
          fromAccountId: requireMappedAccountId(
            accountMap,
            pp.fromAccountId,
            `planned payment "${pp.id}" from account`,
          ),
          toAccountId: requireMappedAccountId(
            accountMap,
            pp.toAccountId,
            `planned payment "${pp.id}" to account`,
          ),
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
          metadataJson: remapCaptureMetadataForImport(
            meta.metadataJson,
            accountMap,
            restoredLinesByJournal.get(journalMap.get(meta.journalId)!) ?? [],
          ),
          createdAt: parseTimestamp(meta.createdAt),
          updatedAt: parseTimestamp(meta.updatedAt),
        })),
        accountMatchers: remappedMatchers.matchers,
        transactionInboxRecords: inboxSources.map(inbox => ({
          id: inboxRecordMap.get(inbox.id) ?? generateId(),
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
          metadataJson:
            inbox.channel === 'email'
              ? withoutEmailRecognitionEvidence(inbox.metadataJson)
              : inbox.metadataJson,
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
      const workplacePreferences = data.workplacePreferences
        ? {
            ...data.workplacePreferences,
            automaticTransactionCapture: remapCapturePreferencesForImport(
              data.workplacePreferences.automaticTransactionCapture,
              accountMap,
            ),
            captureCategoryDefaults: remapCategoryDefaultsForImport(
              data.workplacePreferences.captureCategoryDefaults,
              accountMap,
            ),
            ...(data.workplacePreferences.accountMatcherSuppressions
              ? {
                  accountMatcherSuppressions: remapAccountMatcherSuppressions(
                    data.workplacePreferences.accountMatcherSuppressions,
                    accountMap,
                  ),
                }
              : {}),
          }
        : undefined;
      return {
        canonical,
        preferences: data.preferences,
        workplacePreferences,
        workplace: {
          name: data.workplace?.name,
          icon: data.workplace?.icon,
          defaultCurrencyCode: currencyCode,
        },
        stats: {
          ...countAccountsVsCategories(accounts),
          journals: data.journals.length,
          transactions: data.transactions.length,
          budgets: data.budgets?.length || 0,
          auditLogs: data.auditLogs?.length || 0,
          plannedPayments: data.plannedPayments?.length || 0,
          skippedTransactions: 0,
          skippedItems: remappedMatchers.skippedItems.map(item => ({
            id: item.id,
            reason: item.reason,
            description: 'Account matcher was omitted from the restored backup.',
          })),
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
