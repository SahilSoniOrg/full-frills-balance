import { database } from '@/src/data/database/Database';
import {
  getStagedAccounts,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Account from '@/src/data/models/Account';
import { auditRepository } from '@/src/data/repositories/AuditRepository';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import PlannedPayment from '@/src/data/models/PlannedPayment';
import Transaction from '@/src/data/models/Transaction';
import TransactionInboxRecord from '@/src/data/models/TransactionInboxRecord';
import { currencyRepository } from '@/src/data/repositories/CurrencyRepository';
import type {
  JournalPersistenceLine,
  JournalRebuildImpact,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import {
  evaluateJournalLines,
  JournalBalanceError,
} from '@/src/domain/accounting/journalBalanceEvaluator';
import { deriveJournalDisplayType } from '@/src/domain/accounting/journalDisplayType';
import { AuditAction, JournalDisplayType, JournalStatus, TransactionType } from '@/src/types/enums';
import { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { mapTransactionToAudit } from '@/src/types/audit';
import { fromMinorUnits, toMinorUnits } from '@/src/utils/money';
import { Model, Q } from '@nozbe/watermelondb';

export interface ValidatedJournal {
  lines: readonly JournalPersistenceLine[];
  totalAmount: number;
  accountsById: ReadonlyMap<AccountId, Account>;
  precisionByAccountId: ReadonlyMap<AccountId, number>;
  displayType: JournalDisplayType;
}

export const journalTables = {
  get journals() {
    return database.collections.get<Journal>('journals');
  },
  get transactions() {
    return database.collections.get<Transaction>('transactions');
  },
  get metadata() {
    return database.collections.get<JournalMetadata>('journal_metadata');
  },
  get accounts() {
    return database.collections.get<Account>('accounts');
  },
  get plannedPayments() {
    return database.collections.get<PlannedPayment>('planned_payments');
  },
  get inboxRecords() {
    return database.collections.get<TransactionInboxRecord>('transaction_inbox_records');
  },
};

export function localStartOfDay(timestamp: number): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

export function nextDeletionTimestamp(rows: readonly { deletedAt?: Date }[]): Date {
  const latestExistingTimestamp = Math.max(0, ...rows.map(row => row.deletedAt?.getTime() ?? 0));
  return new Date(Math.max(Date.now(), latestExistingTimestamp + 1));
}

export function emptyRebuildImpact(): JournalRebuildImpact {
  return { affectedAccountIds: new Set(), rebuildFromDate: Number.POSITIVE_INFINITY };
}

export function rebuildImpactFor(
  journals: readonly Journal[],
  transactions: readonly Transaction[],
): JournalRebuildImpact {
  return {
    affectedAccountIds: new Set(transactions.map(transaction => transaction.accountId)),
    rebuildFromDate: Math.min(
      ...journals.map(journal => journal.journalDate),
      ...transactions.map(transaction => transaction.transactionDate),
    ),
  };
}

export function toPersistenceLine(transaction: Transaction): JournalPersistenceLine {
  return {
    accountId: transaction.accountId,
    amount: transaction.amount,
    transactionType: transaction.transactionType,
    notes: transaction.notes,
    exchangeRate: transaction.exchangeRate,
    currencyCode: transaction.currencyCode,
  };
}

export async function findActiveJournal(
  journalId: JournalId,
  workplaceId: WorkplaceId,
): Promise<Journal | null> {
  try {
    const journal = await journalTables.journals.find(journalId);
    return journal.workplaceId === workplaceId && !journal.deletedAt ? journal : null;
  } catch {
    return null;
  }
}

export function fetchActiveJournals(
  workplaceId: WorkplaceId,
  journalIds: readonly JournalId[],
): Promise<Journal[]> {
  return journalTables.journals
    .query(
      Q.where('id', Q.oneOf([...journalIds])),
      Q.where('workplace_id', workplaceId),
      Q.where('deleted_at', Q.eq(null)),
    )
    .fetch();
}

/** Lines of the given journals; soft-deleted lines only when `includeDeleted` is set. */
export function fetchJournalTransactions(
  workplaceId: WorkplaceId,
  journalIds: readonly JournalId[],
  { includeDeleted = false }: { includeDeleted?: boolean } = {},
): Promise<Transaction[]> {
  return journalTables.transactions
    .query(
      Q.where('journal_id', Q.oneOf([...journalIds])),
      Q.where('workplace_id', workplaceId),
      ...(includeDeleted ? [] : [Q.where('deleted_at', Q.eq(null))]),
    )
    .fetch();
}

export function groupTransactionsByJournal(
  transactions: readonly Transaction[],
): Map<JournalId, Transaction[]> {
  const grouped = new Map<JournalId, Transaction[]>();
  for (const transaction of transactions) {
    const group = grouped.get(transaction.journalId) ?? [];
    group.push(transaction);
    grouped.set(transaction.journalId, group);
  }
  return grouped;
}

export function prepareDeletedAt<T extends Model & { deletedAt?: Date; updatedAt: Date }>(
  row: T,
  deletedAt: Date | undefined,
  updatedAt: Date,
): T {
  return row.prepareUpdate(record => {
    record.deletedAt = deletedAt;
    record.updatedAt = updatedAt;
  });
}

export function prepareDeleteAudit(
  journal: Journal,
  transactions: readonly Transaction[],
  deletedAt: Date,
  workplaceId: WorkplaceId,
) {
  return auditRepository.prepareLog(
    {
      entityType: 'journal',
      entityId: journal.id,
      action: AuditAction.DELETE,
      changes: {
        before: {
          status: journal.status,
          description: journal.description,
          totalAmount: journal.totalAmount,
          currencyCode: journal.currencyCode,
          transactions: transactions.map(mapTransactionToAudit),
        },
        after: { deletedAt },
      },
    },
    workplaceId,
  );
}

export function prepareRestoreAudit(
  journalId: JournalId,
  previousDeletedAt: Date | undefined,
  restoredAt: Date,
  workplaceId: WorkplaceId,
) {
  return auditRepository.prepareLog(
    {
      entityType: 'journal',
      entityId: journalId,
      action: AuditAction.UPDATE,
      changes: {
        before: { deletedAt: previousDeletedAt },
        after: { restoredAt },
      },
    },
    workplaceId,
  );
}

/**
 * Validates lines against persisted and session-staged accounts. With `roundAmounts`, line
 * amounts are rounded to their account currency precision instead of rejecting excess precision.
 */
export async function validateJournal(params: {
  currencyCode: string;
  status: JournalStatus;
  workplaceId: WorkplaceId;
  transactions: readonly JournalPersistenceLine[];
  session: AccountingWriteSession;
  roundAmounts?: boolean;
}): Promise<ValidatedJournal> {
  const { currencyCode, status, workplaceId, transactions, session, roundAmounts } = params;
  const accountIds = [...new Set(transactions.map(line => line.accountId))];
  const persistedAccounts =
    accountIds.length === 0
      ? []
      : await journalTables.accounts
          .query(
            Q.where('id', Q.oneOf(accountIds)),
            Q.where('workplace_id', workplaceId),
            Q.where('deleted_at', Q.eq(null)),
          )
          .fetch();
  const accountsById = new Map(
    getStagedAccounts(session, workplaceId, new Set(accountIds)).map(account => [
      account.id,
      account,
    ]),
  );
  for (const account of persistedAccounts) accountsById.set(account.id, account);
  const missingAccountIds = accountIds.filter(accountId => !accountsById.has(accountId));
  if (missingAccountIds.length > 0) {
    throw new JournalBalanceError(
      `Journal references missing or deleted account(s): ${missingAccountIds.join(', ')}`,
    );
  }

  const evaluation = await evaluateJournalLines({
    journalCurrency: currencyCode,
    lines: transactions,
    accountCurrencyById: new Map(
      [...accountsById.values()].map(account => [account.id, account.currencyCode]),
    ),
    getPrecision: code => currencyRepository.getPrecision(code),
  });

  const invalidIssue = evaluation.issues.find(
    issue => issue.code !== 'unbalanced' || status === JournalStatus.POSTED,
  );
  if (invalidIssue) throw new JournalBalanceError(invalidIssue.message);

  if (transactions.some(line => !Object.values(TransactionType).includes(line.transactionType))) {
    throw new JournalBalanceError('Journal lines must be debit or credit entries');
  }

  const precisionViolation = roundAmounts
    ? undefined
    : evaluation.lineValues.find(
        (line, index) => line.nativeAmount !== transactions[index]?.amount,
      );
  if (precisionViolation) {
    throw new JournalBalanceError(
      `Journal line ${precisionViolation.id} exceeds ${precisionViolation.accountCurrency} precision`,
    );
  }

  const lines = roundAmounts
    ? transactions.map((line, index) => ({
        ...line,
        amount: evaluation.lineValues[index].nativeAmount,
      }))
    : transactions;
  const totalMinorUnits =
    evaluation.journalTotalAmount !== undefined
      ? toMinorUnits(evaluation.journalTotalAmount, evaluation.journalPrecision)
      : Math.max(evaluation.debitTotalMinorUnits, evaluation.creditTotalMinorUnits);
  return {
    lines,
    totalAmount: fromMinorUnits(totalMinorUnits, evaluation.journalPrecision),
    accountsById,
    precisionByAccountId: new Map(
      evaluation.lineValues.map(line => [line.accountId as AccountId, line.nativePrecision]),
    ),
    displayType: deriveJournalDisplayType(
      lines,
      new Map([...accountsById.values()].map(account => [account.id, account.accountType])),
    ),
  };
}
