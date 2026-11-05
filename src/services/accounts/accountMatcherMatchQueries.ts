import type AccountMatcher from '@/src/data/models/AccountMatcher';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import { parseStoredMatcherDefinition } from '@/src/services/sms/recognition/accountMatcherDefinition';
import {
  compileAccountMatcher,
  matchCompiledAccountMatcher,
} from '@/src/services/sms/recognition/accountMatcherEvaluator';
import type { TextSpan } from '@/src/types/accountMatcher';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import { map, skip } from 'rxjs';
import { ACCOUNT_MATCHER_EVIDENCE_LIMIT } from './accountMatcherEvidenceQueries';
import {
  projectAccountMatcherMembership,
  type AccountMatcherMessage,
} from './accountMatcherMembership';

export interface AccountMatcherLinkedJournal {
  id: JournalId;
  description?: string;
  journalDate: number;
}

export interface AccountMatcherMatchedMessage {
  message: AccountMatcherMessage;
  spans: TextSpan[];
  journal?: AccountMatcherLinkedJournal;
}

export interface AccountMatcherMatches {
  messages: AccountMatcherMatchedMessage[];
  journals: AccountMatcherLinkedJournal[];
  indeterminateCount: number;
}

export interface AccountMatcherMatchData {
  messages: AccountMatcherMessage[];
  journalsById: ReadonlyMap<JournalId, AccountMatcherLinkedJournal>;
  /** Includes currently unavailable/deleted links so a restored journal can invalidate the view. */
  journalIds: JournalId[];
  inspectedCount: number;
  inspectedDates: { start: number; end: number } | null;
}

export type MatcherForMatchDetails = Pick<AccountMatcher, 'id' | 'accountId' | 'definitionJson'>;

/** One bounded read for the page, including older Account-linked evidence and recent inbox SMS. */
export async function loadAccountMatcherMatchData(
  workplaceId: WorkplaceId,
  accountId: AccountId,
): Promise<AccountMatcherMatchData> {
  const [linked, recent, accounts] = await Promise.all([
    transactionInboxRepository.findRecentLinkedToAccount(
      workplaceId,
      accountId,
      ACCOUNT_MATCHER_EVIDENCE_LIMIT,
    ),
    transactionInboxRepository.findRecentSms(workplaceId, ACCOUNT_MATCHER_EVIDENCE_LIMIT),
    accountQueries.findAll(workplaceId),
  ]);
  const bySource = new Map<string, (typeof linked)[number]>();
  for (const message of [...linked, ...recent]) {
    const source = message.deviceSourceId || message.id;
    if (!bySource.has(source)) bySource.set(source, message);
  }
  const messages = await projectAccountMatcherMembership(
    workplaceId,
    [...bySource.values()].sort((left, right) => right.inputDate - left.inputDate),
    accounts,
  );
  const journalIds = [
    ...new Set(
      messages.flatMap(message => (message.linkedJournalId ? [message.linkedJournalId] : [])),
    ),
  ];
  const journals = journalIds.length
    ? await journalQueryRepository.findByIds(workplaceId, journalIds)
    : [];
  const journalsById = new Map(
    journals.map(journal => [
      journal.id,
      {
        id: journal.id,
        description: journal.description,
        journalDate: journal.journalDate,
      },
    ]),
  );
  const dates = messages.map(message => message.inputDate).filter(Number.isFinite);
  return {
    messages,
    journalsById,
    journalIds,
    inspectedCount: messages.length,
    inspectedDates: dates.length ? { start: Math.min(...dates), end: Math.max(...dates) } : null,
  };
}

/** Descriptive preview, independent of the switch that authorizes runtime recognition. */
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

/** Observe only the bounded journal set, including changes to descriptions and restored links. */
export function observeMatcherLinkedJournalChanges(workplaceId: WorkplaceId, ids: JournalId[]) {
  return journalObserveQueries.observeByIdsWithDeleted(workplaceId, ids).pipe(
    skip(1),
    map(() => undefined),
  );
}
