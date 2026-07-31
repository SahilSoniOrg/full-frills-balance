import Account, { AccountType } from '@/src/data/models/Account';
import { TransactionType } from '@/src/data/models/Transaction';
import { generator as generateId } from '@/src/data/database/idGenerator';
import { JournalEntryLine, WorkplaceId, EMPTY_ACCOUNT_ID, TransactionId } from '@/src/types/domain';
import { sanitizeAmount } from '@/src/utils/validation';
import type { BulkJournalRow } from './useBulkJournalEditor';

export function validateBulkJournalRow(row: BulkJournalRow): string | undefined {
  if (!row.description.trim()) return 'Description is required';
  const sanitizedVal = sanitizeAmount(row.amount);
  if (sanitizedVal === null || sanitizedVal <= 0) return 'Amount must be greater than 0';
  if (!row.sourceId || row.sourceId === EMPTY_ACCOUNT_ID) return 'Source account is required';
  if (!row.destinationId || row.destinationId === EMPTY_ACCOUNT_ID)
    return 'Destination account is required';
  if (row.sourceId === row.destinationId) return 'Source and destination accounts must be distinct';
  if (row.isLoadingRate) return 'Exchange rate is loading...';
  if (row.isCrossCurrency && (!row.exchangeRate || parseFloat(row.exchangeRate) <= 0)) {
    return 'Exchange rate is required for cross-currency';
  }
  return undefined;
}

export function buildBulkJournalEntries(
  rows: BulkJournalRow[],
  accounts: Account[],
  workplaceCurrency: string,
  workplaceId: WorkplaceId,
) {
  return rows.map(row => {
    const sourceAccount = accounts.find(account => account.id === row.sourceId);
    const destAccount = accounts.find(account => account.id === row.destinationId);
    const sourceCurrency = sourceAccount?.currencyCode || workplaceCurrency;
    const destCurrency = destAccount?.currencyCode || workplaceCurrency;
    const isCross = row.isCrossCurrency;
    const lines: JournalEntryLine[] = [
      {
        id: generateId() as TransactionId,
        accountId: row.destinationId,
        accountName: destAccount?.name || '',
        accountType: destAccount?.accountType || AccountType.ASSET,
        amount: isCross ? row.convertedAmount.toFixed(2) : row.amount,
        transactionType: TransactionType.DEBIT,
        notes: '',
        exchangeRate: isCross && row.destBaseRate ? row.destBaseRate.toFixed(6) : '',
        accountCurrency: destCurrency,
      },
      {
        id: generateId() as TransactionId,
        accountId: row.sourceId,
        accountName: sourceAccount?.name || '',
        accountType: sourceAccount?.accountType || AccountType.ASSET,
        amount: row.amount,
        transactionType: TransactionType.CREDIT,
        notes: '',
        exchangeRate: isCross && row.sourceBaseRate ? row.sourceBaseRate.toFixed(6) : '',
        accountCurrency: sourceCurrency,
      },
    ];

    return { lines, description: row.description, journalDate: row.journalDate, workplaceId };
  });
}
