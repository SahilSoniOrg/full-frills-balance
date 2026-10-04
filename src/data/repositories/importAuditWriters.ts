import AuditLog from '@/src/data/models/AuditLog';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import { inboxAuditState } from '@/src/data/repositories/inboxAuditState';
import {
  pickImportedSubtype,
  toAccountType,
  toJournalStatus,
  toTransactionType,
} from '@/src/data/repositories/importValueParsers';
import { AuditAction } from '@/src/types/enums';
import type { AuditEntityType } from '@/src/types/enums';
import type { AuditEventType } from '@/src/types/auditEvents';
import type { BatchImportData } from '@/src/types/importContracts';
import { WorkplaceId } from '@/src/types/ids';
import { mapTransactionToAudit } from '@/src/types/audit';

export interface ImportedAuditContext {
  correlationId: string;
  importPluginId?: string;
  sourceFormatVersion?: string;
}

type ImportedAuditRow = { id: string; after: Record<string, unknown> };

type ImportedAuditBuildContext = {
  accountMetadataById: Map<string, NonNullable<BatchImportData['accountMetadata']>[number]>;
  journalMetadataById: Map<string, NonNullable<BatchImportData['journalMetadata']>[number]>;
  budgetScopesById: Map<string, string[]>;
  transactionsByJournalId: Map<string, ReturnType<typeof mapTransactionToAudit>[]>;
};

type ImportedAuditSpec = {
  entityType: AuditEntityType;
  eventType: AuditEventType;
  collect: (data: BatchImportData, ctx: ImportedAuditBuildContext) => ImportedAuditRow[];
};

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

function buildImportedAuditContext(data: BatchImportData): ImportedAuditBuildContext {
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
  return {
    accountMetadataById,
    journalMetadataById,
    budgetScopesById,
    transactionsByJournalId,
  };
}

const IMPORTED_AUDIT_SPECS: ImportedAuditSpec[] = [
  {
    entityType: 'account',
    eventType: 'account.imported',
    collect: (data, ctx) =>
      data.accounts.map(account => {
        const metadata = ctx.accountMetadataById.get(String(account.id));
        return {
          id: account.id,
          after: {
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
        };
      }),
  },
  {
    entityType: 'journal',
    eventType: 'journal.imported',
    collect: (data, ctx) =>
      data.journals.map(journal => {
        const metadata = ctx.journalMetadataById.get(journal.id);
        return {
          id: journal.id,
          after: {
            description: journal.description ?? null,
            notes: journal.notes ?? null,
            journalDate: journal.journalDate,
            currencyCode: journal.currencyCode,
            status: toJournalStatus(journal.status),
            displayType: journal.displayType,
            totalAmount: journal.totalAmount,
            transactionCount: journal.transactionCount,
            transactions: ctx.transactionsByJournalId.get(journal.id) ?? [],
            originalJournalId: journal.originalJournalId ?? null,
            reversingJournalId: journal.reversingJournalId ?? null,
            plannedPaymentId: journal.plannedPaymentId ?? null,
            deletedAt: isoDate(journal.deletedAt),
            importSource: metadata?.importSource ?? null,
          },
        };
      }),
  },
  {
    entityType: 'budget',
    eventType: 'budget.imported',
    collect: (data, ctx) =>
      (data.budgets ?? []).map(budget => ({
        id: budget.id,
        after: {
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
          scopedAccountIds: ctx.budgetScopesById.get(budget.id) ?? [],
        },
      })),
  },
  {
    entityType: 'planned_payment',
    eventType: 'planned_payment.imported',
    collect: data =>
      (data.plannedPayments ?? []).map(payment => ({
        id: payment.id,
        after: {
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
      })),
  },
  {
    entityType: 'transaction_auto_post_rule',
    eventType: 'transaction_auto_post_rule.imported',
    collect: data =>
      (data.transactionAutoPostRules ?? []).map(rule => ({
        id: rule.id,
        after: {
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
      })),
  },
  {
    entityType: 'transaction_inbox_record',
    eventType: 'transaction_inbox_record.imported',
    collect: data =>
      (data.transactionInboxRecords ?? []).map(record => ({
        id: record.id,
        after: inboxAuditState(record),
      })),
  },
];

export function prepareImportedEntityAuditRecords(
  workplaceId: WorkplaceId,
  data: BatchImportData,
  context: ImportedAuditContext,
): AuditLog[] {
  const buildContext = buildImportedAuditContext(data);
  return IMPORTED_AUDIT_SPECS.flatMap(spec =>
    spec.collect(data, buildContext).map(row =>
      importedEntry(spec.entityType, row.id, spec.eventType, row.after, workplaceId, context),
    ),
  );
}
