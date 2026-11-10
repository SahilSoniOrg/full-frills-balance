import type AccountMatcher from '@/src/data/models/AccountMatcher';
import { parseStoredMatcherDefinition } from '@/src/services/sms/recognition/accountMatcherDefinition';
import {
  compileAccountMatcher,
  matchCompiledAccountMatcher,
} from '@/src/services/sms/recognition/accountMatcherEvaluator';
import type {
  AccountMatcherLinkedJournal,
  AccountMatcherMatchedMessage,
  AccountMatcherMatches,
} from '@/src/types/accountMatcher';
import type { AccountId, JournalId } from '@/src/types/ids';
import type { AccountMatcherPageData } from './accountMatcherEvidenceQueries';

export type {
  AccountMatcherLinkedJournal,
  AccountMatcherMatchedMessage,
  AccountMatcherMatches,
} from '@/src/types/accountMatcher';

export type AccountMatcherMatchData = Pick<
  AccountMatcherPageData,
  'messages' | 'journalsById' | 'journalIds' | 'inspectedCount' | 'inspectedDates'
>;

export type MatcherForMatchDetails = Pick<AccountMatcher, 'id' | 'accountId' | 'definitionJson'>;

/** Pure descriptive preview, independent of the switch that authorizes runtime recognition. */
export function evaluateAccountMatcherMatches(
  data: AccountMatcherMatchData,
  accountId: AccountId,
  matchers: readonly MatcherForMatchDetails[],
): ReadonlyMap<string, AccountMatcherMatches> {
  const byMatcherId = new Map<string, AccountMatcherMatches>();
  for (const matcher of matchers) {
    if (matcher.accountId !== accountId) continue;
    const compiled = compileAccountMatcher({
      id: matcher.id,
      accountId,
      definition: parseStoredMatcherDefinition(matcher.definitionJson),
    });
    const messages: AccountMatcherMatchedMessage[] = [];
    const journals = new Map<JournalId, AccountMatcherLinkedJournal>();
    let indeterminateCount = 0;
    for (const message of data.messages) {
      const result = matchCompiledAccountMatcher(compiled, {
        senderAddress: message.senderAddress ?? '',
        rawBody: message.rawBody ?? '',
      });
      if (result.status === 'indeterminate') indeterminateCount++;
      if (result.status !== 'match') continue;
      const journal = message.linkedJournalId
        ? data.journalsById.get(message.linkedJournalId)
        : undefined;
      messages.push({ message, spans: result.spans, ...(journal ? { journal } : {}) });
      if (journal) journals.set(journal.id, journal);
    }
    byMatcherId.set(matcher.id, { messages, journals: [...journals.values()], indeterminateCount });
  }
  return byMatcherId;
}
