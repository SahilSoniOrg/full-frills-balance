import { JournalEntryLine } from '@/src/types/domainJournal';
import { AccountType, TransactionType } from '@/src/types/enums';
import { TransactionId } from '@/src/types/ids';

export function makeJournalEntryLine(
  partial: Partial<JournalEntryLine> & Pick<JournalEntryLine, 'id' | 'transactionType'>,
): JournalEntryLine {
  return {
    accountId: 'a1' as JournalEntryLine['accountId'],
    accountName: 'Account',
    accountType: AccountType.ASSET,
    amount: '10',
    notes: '',
    exchangeRate: '',
    ...partial,
  };
}

export function makeBlankLine(id: string, type: TransactionType): JournalEntryLine {
  return makeJournalEntryLine({
    id: id as TransactionId,
    accountId: 'account' as JournalEntryLine['accountId'],
    accountName: 'Account',
    accountType: AccountType.ASSET,
    amount: '10',
    transactionType: type,
  });
}
