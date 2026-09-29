import AuditLog from '@/src/data/models/AuditLog';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import {
  pickImportedSubtype,
  toAccountType,
  toJournalStatus,
  toTransactionType,
} from '@/src/data/repositories/importValueParsers';
import { AuditAction } from '@/src/types/enums';
import type { AuditEntityType } from '@/src/types/enums';
import { inboxAuditState } from '@/src/data/repositories/inboxAuditState';
import type { AuditEventType } from '@/src/types/auditEvents';
import type { BatchImportData } from '@/src/types/importContracts';
import { WorkplaceId } from '@/src/types/ids';
import { mapTransactionToAudit } from '@/src/types/audit';

export interface ImportedAuditContext {
  correlationId: string;
  importPluginId?: string;
  sourceFormatVersion?: string;
}

function importedEntry(
  entityType: AuditEntityType,
  entityId: string,
  eventType: AuditEventType,
  after: Record<string, unknown>,
  workplaceId: WorkplaceId,
  context: ImportedAuditContext,
): AuditLog {
  return auditRepository.prepareLog(
    {
      entityType,
      entityId,
      eventType,
      source: 'import',
      correlationId: context.correlationId,
      action: AuditAction.CREATE,
      changes: {
        after,
        ...(context.importPluginId ? { importPluginId: context.importPluginId } : {}),
        ...(context.sourceFormatVersion
          ? { sourceFormatVersion: context.sourceFormatVersion }
          : {}),
      },
      undoable: false,
    },
    workplaceId,
  );
}

function isoDate(timestamp?: number): string | null {
  if (timestamp === undefined || timestamp === null) return null;
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function prepareImportedEntityAuditRecords(
  workplaceId: WorkplaceId,
  data: BatchImportData,
  context: ImportedAuditContext,
): AuditLog[] {
  const accountMetadataById = new Map<
    string,
    NonNullable<BatchImportData['accountMetadata']>[number]
  >();
  for (const metadata of data.accountMetadata ?? []) {
    accountMetadataById.set(metadata.accountId, metadata);
  }
  const journalMetadataById = new Map(
    (data.journalMetadata ?? []).map(item => [item.journalId, item]),
  );
  const budgetScopesById = new Map<string, string[]>();
  for (const scope of data.budgetScopes ?? []) {
    const accountIds = budgetScopesById.get(scope.budgetId) ?? [];
    accountIds.push(scope.accountId);
    budgetScopesById.set(scope.budgetId, accountIds);
  }
  const transactionsByJournalId = new Map<
    string,
    ReturnType<typeof mapTransactionToAudit>[]
  >();
  for (const transaction of data.transactions) {
    if (transaction.deletedAt != null) continue;
    const snapshots = transactionsByJournalId.get(transaction.journalId) ?? [];
    snapshots.push(
      mapTransactionToAudit({
        accountId: transaction.accountId,
        amount: transaction.amount,
        transactionType: toTransactionType(transaction.transactionType),
        notes: transaction.notes,
        exchangeRate: transaction.exchangeRate,
        currencyCode: transaction.currencyCode,
      }),
    );
    transactionsByJournalId.set(transaction.journalId, snapshots);
  }

  const accountEntries = data.accounts.map(account => {
    const metadata = accountMetadataById.get(String(account.id));
    return importedEntry(
      'account',
      account.id,
      'account.imported',
      {
        name: account.name,
        accountType: toAccountType(account.accountType),
        accountSubtype: pickImportedSubtype(account),
        currencyCode: account.currencyCode,
        description: account.description ?? null,
        icon: account.icon ?? null,
        color: account.color ?? null,
        orderNum: account.orderNum ?? null,
        parentAccountId: account.parentAccountId ?? null,
        reconciledAt: isoDate(account.reconciledAt),
        archivedAt: isoDate(account.archivedAt),
        deletedAt: isoDate(account.deletedAt),
        metadata: metadata
          ? {
              statementDay: metadata.statementDay ?? null,
              dueDay: metadata.dueDay ?? null,
              minimumPaymentAmount: metadata.minimumPaymentAmount ?? null,
              minimumBalanceAmount: metadata.minimumBalanceAmount ?? null,
              creditLimitAmount: metadata.creditLimitAmount ?? null,
              aprBps: metadata.aprBps ?? null,
              emiDay: metadata.emiDay ?? null,
              loanTenureMonths: metadata.loanTenureMonths ?? null,
              autopayEnabled: metadata.autopayEnabled ?? null,
              gracePeriodDays: metadata.gracePeriodDays ?? null,
              payFromAccountId: metadata.payFromAccountId ?? null,
              minPaymentOnly: metadata.minPaymentOnly ?? null,
              minimumPaymentPercent: metadata.minimumPaymentPercent ?? null,
              notes: metadata.notes ?? null,
            }
          : null,
      },
      workplaceId,
      context,
    );
  });

  const journalEntries = data.journals.map(journal => {
    const metadata = journalMetadataById.get(journal.id);
    return importedEntry(
      'journal',
      journal.id,
      'journal.imported',
      {
        description: journal.description ?? null,
        notes: journal.notes ?? null,
        journalDate: journal.journalDate,
        currencyCode: journal.currencyCode,
        status: toJournalStatus(journal.status),
        displayType: journal.displayType,
        totalAmount: journal.totalAmount,
        transactionCount: journal.transactionCount,
        transactions: transactionsByJournalId.get(journal.id) ?? [],
        originalJournalId: journal.originalJournalId ?? null,
        reversingJournalId: journal.reversingJournalId ?? null,
        plannedPaymentId: journal.plannedPaymentId ?? null,
        deletedAt: isoDate(journal.deletedAt),
        importSource: metadata?.importSource ?? null,
      },
      workplaceId,
      context,
    );
  });

  const budgetEntries = (data.budgets ?? []).map(budget =>
    importedEntry(
      'budget',
      budget.id,
      'budget.imported',
      {
        name: budget.name,
        amount: budget.amount,
        currencyCode: budget.currencyCode,
        startMonth: budget.startMonth,
        intervalType: budget.intervalType ?? null,
        intervalN: budget.intervalN ?? null,
        startDate: budget.startDate ?? null,
        recurrenceDay: budget.recurrenceDay ?? null,
        recurrenceMonth: budget.recurrenceMonth ?? null,
        active: budget.active,
        assetAccountIds: (budget.assetAccountIds ?? '')
          .split(',')
          .map(id => id.trim())
          .filter(Boolean),
        scopedAccountIds: budgetScopesById.get(budget.id) ?? [],
      },
      workplaceId,
      context,
    ),
  );

  const plannedPaymentEntries = (data.plannedPayments ?? []).map(payment =>
    importedEntry(
      'planned_payment',
      payment.id,
      'planned_payment.imported',
      {
        name: payment.name,
        description: payment.description ?? null,
        amount: payment.amount,
        currencyCode: payment.currencyCode,
        fromAccountId: payment.fromAccountId,
        toAccountId: payment.toAccountId,
        intervalN: payment.intervalN,
        intervalType: payment.intervalType,
        startDate: payment.startDate,
        endDate: payment.endDate ?? null,
        nextOccurrence: payment.nextOccurrence,
        status: payment.status,
        isAutoPost: payment.isAutoPost,
        recurrenceDay: payment.recurrenceDay ?? null,
        recurrenceMonth: payment.recurrenceMonth ?? null,
        deletedAt: isoDate(payment.deletedAt),
      },
      workplaceId,
      context,
    ),
  );

  const ruleEntries = (data.transactionAutoPostRules ?? []).map(rule =>
    importedEntry(
      'transaction_auto_post_rule',
      rule.id,
      'transaction_auto_post_rule.imported',
      {
        channelsJson: rule.channelsJson ?? null,
        senderMatch: rule.senderMatch ?? null,
        bodyMatch: rule.bodyMatch ?? null,
        conditionsJson: rule.conditionsJson ?? null,
        actionsJson: rule.actionsJson ?? null,
        priority: rule.priority ?? null,
        sourceAccountId: rule.sourceAccountId,
        categoryAccountId: rule.categoryAccountId,
        isActive: rule.isActive,
      },
      workplaceId,
      context,
    ),
  );

  const inboxEntries = (data.transactionInboxRecords ?? []).map(record =>
    importedEntry(
      'transaction_inbox_record',
      record.id,
      'transaction_inbox_record.imported',
      inboxAuditState(record),
      workplaceId,
      context,
    ),
  );

  return [
    ...accountEntries,
    ...journalEntries,
    ...budgetEntries,
    ...plannedPaymentEntries,
    ...ruleEntries,
    ...inboxEntries,
  ];
}
