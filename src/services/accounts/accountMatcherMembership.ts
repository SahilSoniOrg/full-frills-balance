import { transactionQueryRepository } from '@/src/data/repositories/transaction';
import type { AccountMatcherPreviewMessage } from '@/src/types/accountMatcher';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import type { PlainAccount } from '@/src/types/plainDtos';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { getEligibleMatcherAccountIds } from './accountMatcherEligibility';

/** Hydrates only the selected SMS journals, using one financial-account membership policy. */
export async function projectAccountMatcherMembership(
  workplaceId: WorkplaceId,
  messages: readonly InboxRecordSnapshot[],
  accounts: readonly PlainAccount[],
): Promise<AccountMatcherPreviewMessage[]> {
  const journalIds = [
    ...new Set(
      messages.flatMap(message => (message.linkedJournalId ? [message.linkedJournalId] : [])),
    ),
  ];
  const transactions = journalIds.length
    ? await transactionQueryRepository.findByJournals(workplaceId, journalIds)
    : [];
  const eligibleIds = getEligibleMatcherAccountIds(accounts);
  const accountsByJournal = new Map<JournalId, Set<AccountId>>();
  for (const transaction of transactions) {
    if (!eligibleIds.has(transaction.accountId)) continue;
    const ids = accountsByJournal.get(transaction.journalId) ?? new Set<AccountId>();
    ids.add(transaction.accountId);
    accountsByJournal.set(transaction.journalId, ids);
  }
  const namesById = new Map(accounts.map(account => [account.id, account.name]));
  return messages.map(message => {
    const linkedAccountIds = message.linkedJournalId
      ? [...(accountsByJournal.get(message.linkedJournalId) ?? [])]
      : [];
    return {
      ...message,
      linkedAccountIds,
      linkedAccountNames: linkedAccountIds.map(id => namesById.get(id) ?? ''),
    };
  });
}
