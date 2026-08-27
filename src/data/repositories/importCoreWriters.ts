import Account from '@/src/data/models/Account';
import Journal from '@/src/data/models/Journal';
import Transaction from '@/src/data/models/Transaction';
import {
  pickImportedSubtype,
  toAccountType,
  toJournalStatus,
  toTransactionType,
} from '@/src/data/repositories/importValueParsers';
import { setRecordTimestamps } from '@/src/data/repositories/importPersistenceAdapter';
import type {
  ImportedAccount,
  ImportedJournal,
  ImportedTransaction,
} from '@/src/data/repositories/importTypes';
import { WorkplaceId } from '@/src/types/ids';
import { Collection, Model } from '@nozbe/watermelondb';

export function prepareCoreImportRecords(
  workplaceId: WorkplaceId,
  collections: {
    accounts: Collection<Account>;
    journals: Collection<Journal>;
    transactions: Collection<Transaction>;
  },
  data: {
    accounts: ImportedAccount[];
    journals: ImportedJournal[];
    transactions: ImportedTransaction[];
  },
): Model[] {
  const accountPrepares = data.accounts.map(account =>
    collections.accounts.prepareCreate(record => {
      record._raw.id = account.id;
      record.workplaceId = workplaceId;
      record.name = account.name;
      record.accountType = toAccountType(account.accountType);
      record.accountSubtype = pickImportedSubtype(account);
      record.currencyCode = account.currencyCode;
      record.parentAccountId = account.parentAccountId;
      record.description = account.description;
      record.icon = account.icon;
      record.color = account.color;
      record.orderNum = account.orderNum;
      if (account.reconciledAt !== undefined && account.reconciledAt !== null) {
        record.reconciledAt = new Date(account.reconciledAt);
      }
      if (account.archivedAt !== undefined && account.archivedAt !== null) {
        record.archivedAt = new Date(account.archivedAt);
      }
      record._raw._status = 'synced';
      setRecordTimestamps(record, {
        createdAt: account.createdAt,
        updatedAt: account.updatedAt,
        deletedAt: account.deletedAt,
      });
    }),
  );

  const journalPrepares = data.journals.map(journal =>
    collections.journals.prepareCreate(record => {
      record._raw.id = journal.id;
      record.workplaceId = workplaceId;
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
      record._raw._status = 'synced';
      setRecordTimestamps(record, {
        createdAt: journal.createdAt,
        updatedAt: journal.updatedAt,
        deletedAt: journal.deletedAt,
      });
    }),
  );

  const transactionPrepares = data.transactions.map(transaction =>
    collections.transactions.prepareCreate(record => {
      record._raw.id = transaction.id;
      record.workplaceId = workplaceId;
      record.journalId = transaction.journalId;
      record.accountId = transaction.accountId;
      record.amount = transaction.amount;
      record.transactionType = toTransactionType(transaction.transactionType);
      record.currencyCode = transaction.currencyCode;
      record.transactionDate = transaction.transactionDate;
      record.notes = transaction.notes;
      record.exchangeRate = transaction.exchangeRate;
      record.runningBalance = transaction.runningBalance;
      record._raw._status = 'synced';
      setRecordTimestamps(record, {
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
        deletedAt: transaction.deletedAt,
      });
    }),
  );

  return [...accountPrepares, ...journalPrepares, ...transactionPrepares];
}
