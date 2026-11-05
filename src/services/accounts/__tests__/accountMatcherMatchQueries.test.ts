import {
  evaluateAccountMatcherMatches,
  type AccountMatcherMatchData,
} from '../accountMatcherMatchQueries';
import type { AccountMatcherMessage } from '../accountMatcherMembership';
import { asAccountId, asJournalId, asWorkplaceId } from '@/src/types/ids';
import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';

const accountId = asAccountId('matching-account');
const journalId = asJournalId('linked-journal');
const journal = { id: journalId, description: 'Card payment', journalDate: Date.UTC(2026, 10, 4) };
function message(id: string, body: string, linked = false): AccountMatcherMessage {
  return {
    id,
    workplaceId: asWorkplaceId('match-query-workplace'),
    channel: 'sms',
    deviceSourceId: id,
    senderAddress: 'BANKXYZ',
    rawBody: body,
    inputDate: Date.UTC(2026, 10, 4),
    inputFingerprint: id,
    parseStatus: InboxParseStatus.PARSED,
    processingStatus: InboxProcessingStatus.PENDING,
    direction: TransactionDirection.DEBIT,
    firstSeenAt: 1,
    lastScannedAt: 1,
    linkedAccountIds: linked ? [accountId] : [],
    linkedAccountNames: linked ? ['Checking'] : [],
    ...(linked ? { linkedJournalId: journalId } : {}),
  };
}
const data: AccountMatcherMatchData = {
  messages: [
    message('first', 'card ending 1234', true),
    message('second', 'card payment 1234', true),
    message('pending', 'card purchase 1234'),
    message('unrelated', 'card ending 5678'),
  ],
  journalsById: new Map([[journalId, journal]]),
  journalIds: [journalId],
  inspectedCount: 4,
  inspectedDates: null,
};
const matcher = {
  id: 'saved-pattern',
  accountId,
  isEnabled: false,
  definitionJson: JSON.stringify({
    version: 1,
    body: { kind: 'fragments', fragments: ['card', '1234'] },
  }),
};

describe('saved matcher message details', () => {
  it('keeps descriptive matches for disabled patterns and counts linked journals once', () => {
    const result = evaluateAccountMatcherMatches(data, accountId, [matcher]).get(matcher.id);
    expect(result?.messages.map(entry => entry.message.id)).toEqual(['first', 'second', 'pending']);
    expect(result?.journals).toEqual([journal]);
    expect(result?.messages[0].journal).toEqual(journal);
    expect(result?.messages[2].journal).toBeUndefined();
  });

  it('does not publish another Account’s matcher results', () => {
    expect(evaluateAccountMatcherMatches(data, asAccountId('other-account'), [matcher]).size).toBe(
      0,
    );
  });

  it('reports invalid definitions as incomplete instead of showing them as matches', () => {
    const broken = { ...matcher, definitionJson: '{broken' };
    const result = evaluateAccountMatcherMatches(data, accountId, [broken]).get(matcher.id);
    expect(result?.messages).toEqual([]);
    expect(result?.indeterminateCount).toBe(data.messages.length);
  });
});
