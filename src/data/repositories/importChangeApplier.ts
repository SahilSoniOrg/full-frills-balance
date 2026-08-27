import { database } from '@/src/data/database/Database';
import Account from '@/src/data/models/Account';
import AuditLog from '@/src/data/models/AuditLog';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import {
  assignImportWorkplaceId,
  setImportSoftDeleted,
  setRecordTimestamps,
} from '@/src/data/repositories/importPersistenceAdapter';
import {
  pickImportedSubtype,
  toAccountType,
  toAuditAction,
  toJournalStatus,
  toTransactionType,
} from '@/src/data/repositories/importValueParsers';
import type {
  ChangeSet,
  ImportedAccount,
  ImportedAuditLog,
  ImportedJournal,
  ImportedTransaction,
} from '@/src/data/repositories/importTypes';
import { WorkplaceId } from '@/src/types/ids';
import { IconName } from '@/src/types/domainIcons';
import { Collection, Model, Q } from '@nozbe/watermelondb';

export type ImportChanges = {
  accounts: ChangeSet<ImportedAccount>;
  journals: ChangeSet<ImportedJournal>;
  transactions: ChangeSet<ImportedTransaction>;
  auditLogs?: ChangeSet<ImportedAuditLog>;
};

export async function applyImportChanges(
  workplaceId: WorkplaceId,
  data: ImportChanges,
): Promise<void> {
  await database.write(async () => {
    const accountsCollection = database.collections.get<Account>('accounts');
    const journalsCollection = database.collections.get<Journal>('journals');
    const transactionsCollection = database.collections.get<Transaction>('transactions');
    const auditLogsCollection = database.collections.get<AuditLog>('audit_logs');
    const ops: Model[] = [];

    const upsert = async <T extends Model, D extends { id: string }>(
      collection: Collection<T>,
      records: D[],
      prepare: (record: T, data: D) => void,
    ) => {
      if (records.length === 0) return;
      const ids = records.map(record => record.id);
      const existing = await collection
        .query(Q.where('id', Q.oneOf(ids)), Q.where('workplace_id', workplaceId))
        .fetch();
      const existingById = new Map(existing.map(record => [record.id, record]));

      for (const imported of records) {
        const existingRecord = existingById.get(imported.id);
        if (existingRecord) {
          ops.push(
            existingRecord.prepareUpdate(record => {
              prepare(record, imported);
              record._raw._status = 'synced';
            }) as T,
          );
        } else {
          ops.push(
            collection.prepareCreate(record => {
              record._raw.id = imported.id;
              assignImportWorkplaceId(record, workplaceId);
              prepare(record, imported);
              record._raw._status = 'synced';
            }) as T,
          );
        }
      }
    };

    const softDelete = async <T extends Model>(collection: Collection<T>, ids: string[]) => {
      if (ids.length === 0) return;
      const existing = await collection
        .query(Q.where('id', Q.oneOf(ids)), Q.where('workplace_id', workplaceId))
        .fetch();
      const now = Date.now();
      for (const record of existing) {
        ops.push(record.prepareUpdate(value => setImportSoftDeleted(value, now, now)));
      }
    };

    const hardDelete = async <T extends Model>(collection: Collection<T>, ids: string[]) => {
      if (ids.length === 0) return;
      const existing = await collection
        .query(Q.where('id', Q.oneOf(ids)), Q.where('workplace_id', workplaceId))
        .fetch();
      for (const record of existing) ops.push(record.prepareDestroyPermanently());
    };

    await upsert(
      accountsCollection,
      [...(data.accounts.created || []), ...(data.accounts.updated || [])],
      (record: Account, account: ImportedAccount) => {
        record.name = account.name;
        record.accountType = toAccountType(account.accountType);
        record.accountSubtype = pickImportedSubtype(account);
        record.currencyCode = account.currencyCode;
        record.parentAccountId = account.parentAccountId;
        record.description = account.description;
        record.icon = account.icon as IconName;
        record.orderNum = account.orderNum;
        if (account.reconciledAt !== undefined && account.reconciledAt !== null) {
          record.reconciledAt = new Date(account.reconciledAt);
        }
        if (account.archivedAt !== undefined && account.archivedAt !== null) {
          record.archivedAt = new Date(account.archivedAt);
        }
        setRecordTimestamps(record, {
          createdAt: account.createdAt,
          updatedAt: account.updatedAt,
          deletedAt: account.deletedAt ?? null,
        });
      },
    );

    await upsert(
      journalsCollection,
      [...(data.journals.created || []), ...(data.journals.updated || [])],
      (record: Journal, journal: ImportedJournal) => {
        record.journalDate = journal.journalDate;
        record.description = journal.description;
        record.notes = journal.notes;
        record.currencyCode = journal.currencyCode;
        record.status = toJournalStatus(journal.status);
        record.originalJournalId = journal.originalJournalId;
        record.reversingJournalId = journal.reversingJournalId;
        record.totalAmount = journal.totalAmount;
        record.transactionCount = journal.transactionCount;
        record.displayType = journal.displayType;
        if (journal.plannedPaymentId) record.plannedPaymentId = journal.plannedPaymentId;
        setRecordTimestamps(record, {
          createdAt: journal.createdAt,
          updatedAt: journal.updatedAt,
          deletedAt: journal.deletedAt ?? null,
        });
      },
    );

    await upsert(
      transactionsCollection,
      [...(data.transactions.created || []), ...(data.transactions.updated || [])],
      (record: Transaction, transaction: ImportedTransaction) => {
        record.journalId = transaction.journalId;
        record.accountId = transaction.accountId;
        record.amount = transaction.amount;
        record.transactionType = toTransactionType(transaction.transactionType);
        record.currencyCode = transaction.currencyCode;
        record.transactionDate = transaction.transactionDate;
        record.notes = transaction.notes;
        record.exchangeRate = transaction.exchangeRate;
        record.runningBalance = transaction.runningBalance;
        setRecordTimestamps(record, {
          createdAt: transaction.createdAt,
          updatedAt: transaction.updatedAt,
          deletedAt: transaction.deletedAt ?? null,
        });
      },
    );

    if (data.auditLogs) {
      await upsert(
        auditLogsCollection,
        [...(data.auditLogs.created || []), ...(data.auditLogs.updated || [])],
        (record: AuditLog, log: ImportedAuditLog) => {
          record.entityType = log.entityType;
          record.entityId = log.entityId;
          record.action = toAuditAction(log.action);
          record.changes = log.changes;
          record.timestamp = log.timestamp;
          setRecordTimestamps(record, { createdAt: log.createdAt });
        },
      );
    }

    await softDelete(accountsCollection, data.accounts.deleted || []);
    await softDelete(journalsCollection, data.journals.deleted || []);
    await softDelete(transactionsCollection, data.transactions.deleted || []);
    if (data.auditLogs) await hardDelete(auditLogsCollection, data.auditLogs.deleted || []);
    if (ops.length > 0) await database.batch(ops);
  });
}
