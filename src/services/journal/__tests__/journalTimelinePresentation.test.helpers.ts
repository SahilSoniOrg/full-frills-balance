import { AccountType, JournalDisplayType } from '@/src/types/enums';
import { asAccountId, asJournalId, asTransactionId } from '@/src/types/ids';
import type { EnrichedJournal } from '@/src/types/domainReadModels';

export function timelineAccount(
  id: string,
  role: EnrichedJournal['accounts'][number]['role'],
  amount?: number,
  currencyCode = 'USD',
  exchangeRate?: number,
): EnrichedJournal['accounts'][number] {
  return {
    id: asAccountId(id),
    transactionId: asTransactionId(`posting-${id}`),
    name: id,
    accountType: role === 'SOURCE' ? AccountType.ASSET : AccountType.EXPENSE,
    role,
    amount,
    currencyCode,
    exchangeRate,
  };
}

export function timelineJournal(
  accounts: EnrichedJournal['accounts'],
  currencyCode = 'USD',
): EnrichedJournal {
  return {
    id: asJournalId('journal'),
    journalDate: 1_700_000_000_000,
    description: 'Split purchase',
    currencyCode,
    status: 'POSTED',
    totalAmount: 1000,
    transactionCount: accounts.length,
    displayType: JournalDisplayType.EXPENSE,
    accounts,
  };
}
