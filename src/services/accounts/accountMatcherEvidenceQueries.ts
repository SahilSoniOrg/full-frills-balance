import type AccountMatcher from '@/src/data/models/AccountMatcher';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { journalQueryRepository } from '@/src/data/repositories/journal/journalQueryRepository';
import { journalObserveQueries } from '@/src/data/repositories/journal/JournalObserveQueries';
import { accountMatcherRepository } from '@/src/data/repositories/AccountMatcherRepository';
import { transactionObserveQueries } from '@/src/data/repositories/transaction';
import { accountQueries } from '@/src/services/accounts/accountQueries';
import type {
  AccountMatcherDiscoveryMessage,
  AccountMatcherLinkedJournal,
  AccountMatcherPreviewMessage,
  AccountMatcherSnapshot,
  SmsRecognitionSummary,
} from '@/src/types/accountMatcher';
import type { AccountId, JournalId, WorkplaceId } from '@/src/types/ids';
import type { PlainAccount } from '@/src/types/plainDtos';
import { combineLatest, map, merge, skip } from 'rxjs';
import { projectAccountMatcherMembership } from './accountMatcherMembership';

export type { AccountMatcherLinkedJournal } from '@/src/types/accountMatcher';

export const ACCOUNT_MATCHER_EVIDENCE_LIMIT = 200;

export interface AccountMatcherEvidenceData {
  evidence: AccountMatcherDiscoveryMessage[];
  comparisonMessages: AccountMatcherDiscoveryMessage[];
  latestLinkTime: number;
}

/**
 * Canonical bounded snapshot for matcher management and editing. Older linked SMS
 * and recent inbox SMS are projected together so every view sees the same evidence.
 */
export interface AccountMatcherPageData extends AccountMatcherEvidenceData {
  accounts: PlainAccount[];
  messages: AccountMatcherPreviewMessage[];
  matchers: AccountMatcherSnapshot[];
  journalsById: ReadonlyMap<JournalId, AccountMatcherLinkedJournal>;
  /** Includes unavailable links so a restored journal can invalidate the view. */
  journalIds: JournalId[];
  inspectedCount: number;
  inspectedDates: { start: number; end: number } | null;
  recentRecognitions: SmsRecognitionSummary[];
}

function toSnapshot(matcher: AccountMatcher): AccountMatcherSnapshot {
  return {
    id: matcher.id,
    accountId: matcher.accountId,
    definitionJson: matcher.definitionJson,
    conditionsKey: matcher.conditionsKey,
    isEnabled: matcher.isEnabled,
  };
}

/** One bounded read set for the matcher screen and editor. */
export async function loadAccountMatcherPageData(
  workplaceId: WorkplaceId,
  accountId: AccountId,
  limit = ACCOUNT_MATCHER_EVIDENCE_LIMIT,
): Promise<AccountMatcherPageData> {
  const [linked, recent, accounts] = await Promise.all([
    transactionInboxRepository.findRecentLinkedToAccount(workplaceId, accountId, limit),
    transactionInboxRepository.findRecentSms(workplaceId, limit),
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
  const messagesBySource = new Map(
    messages.map(message => [message.deviceSourceId || message.id, message]),
  );
  const evidence = linked
    .map(message => messagesBySource.get(message.deviceSourceId || message.id))
    .filter((message): message is (typeof messages)[number] =>
      Boolean(message?.linkedAccountIds.includes(accountId)),
    );
  const comparisonMessages = recent
    .map(message => messagesBySource.get(message.deviceSourceId || message.id))
    .filter((message): message is (typeof messages)[number] =>
      Boolean(message?.linkedAccountIds.length),
    );
  const latestLinkTime = Math.max(
    0,
    ...evidence.map(message => message.processedAt ?? message.lastScannedAt ?? message.inputDate),
  );

  const journalIds = [
    ...new Set(
      messages.flatMap(message => (message.linkedJournalId ? [message.linkedJournalId] : [])),
    ),
  ];
  const [journals, matchers] = await Promise.all([
    journalIds.length
      ? journalQueryRepository.findByIds(workplaceId, journalIds)
      : Promise.resolve([]),
    accounts.length
      ? accountMatcherRepository.findAllByAccountIds(
          workplaceId,
          accounts.map(account => account.id),
        )
      : Promise.resolve([]),
  ]);
  const journalsById = new Map(
    journals.map(journal => [
      journal.id,
      { id: journal.id, description: journal.description, journalDate: journal.journalDate },
    ]),
  );

  const recentSources = new Set(recent.map(message => message.deviceSourceId || message.id));
  const recentRecognitions = messages.flatMap(message =>
    recentSources.has(message.deviceSourceId || message.id) && message.recognition
      ? [message.recognition]
      : [],
  );
  const dates = messages.map(message => message.inputDate).filter(Number.isFinite);

  return {
    accounts,
    messages,
    matchers: matchers.map(toSnapshot),
    evidence,
    comparisonMessages,
    latestLinkTime,
    journalsById,
    journalIds,
    inspectedCount: messages.length,
    inspectedDates: dates.length ? { start: Math.min(...dates), end: Math.max(...dates) } : null,
    recentRecognitions,
  };
}

/** Invalidation signals only; subscribing never materializes full SMS history. */
export function observeAccountMatcherEvidenceChanges(
  workplaceId: WorkplaceId,
  journalIds: readonly JournalId[] = [],
) {
  const evidence = combineLatest([
    transactionObserveQueries.observeMatcherDiscoveryChanges(workplaceId),
    transactionInboxRepository.observeMatcherDiscoveryEvidence(workplaceId),
    accountQueries.observeAll(workplaceId),
  ]).pipe(
    skip(1),
    map(() => undefined),
  );
  if (!journalIds.length) return evidence;
  const journals = journalObserveQueries.observeByIdsWithDeleted(workplaceId, [...journalIds]).pipe(
    skip(1),
    map(() => undefined),
  );
  return merge(evidence, journals);
}
