import { InboxParseStatus, InboxProcessingStatus, TransactionDirection } from '@/src/types/enums';
import { asAccountId, asJournalId, asWorkplaceId } from '@/src/types/ids';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import type { AccountId } from '@/src/types/ids';
import type { AccountMatcherDiscoveryMessage } from '../accountMatcherDiscovery';
import { conditionsKeyFor } from '../accountMatcherDefinition';
import { discoverAccountMatcherProposals } from '../accountMatcherDiscovery';

const ACCOUNT = asAccountId('card-account');
const OTHER_ACCOUNT = asAccountId('other-account');
const WORKPLACE = asWorkplaceId('matcher-discovery-wp');

function sms(
  id: string,
  journalId: string,
  options: Partial<InboxRecordSnapshot> & {
    body?: string;
    linkedAccountIds?: AccountId[];
    contentDigest?: string;
  } = {},
): AccountMatcherDiscoveryMessage {
  const { body, ...overrides } = options;
  return {
    id,
    workplaceId: WORKPLACE,
    channel: 'sms' as const,
    deviceSourceId: id,
    senderAddress: 'VM-BANKXYZ-S',
    rawBody: body ?? 'Your card ending in 1234 was charged INR 50 at North Cafe',
    inputDate: 1_800_000_000_000,
    inputFingerprint: id,
    parseStatus: InboxParseStatus.PARSED,
    parsedAmount: 50,
    parsedMerchant: 'North Cafe',
    parsedAccountSource: '1234',
    referenceNumber: undefined,
    direction: TransactionDirection.DEBIT,
    processingStatus: InboxProcessingStatus.IMPORTED,
    linkedJournalId: asJournalId(journalId),
    firstSeenAt: 1_800_000_000_000,
    lastScannedAt: 1_800_000_000_000,
    linkedAccountIds: options.linkedAccountIds ?? [ACCOUNT],
    ...overrides,
  };
}

function discover(
  evidence: ReturnType<typeof sms>[],
  options: {
    comparisons?: ReturnType<typeof sms>[];
    matchers?: {
      definition: unknown;
      isEnabled: boolean;
      conditionsKey?: string;
    }[];
    suppressions?: {
      accountId: typeof ACCOUNT;
      conditionsKey: string;
      reason: 'dismissed' | 'forgotten';
    }[];
  } = {},
) {
  return discoverAccountMatcherProposals({
    accountId: ACCOUNT,
    evidence,
    comparisonMessages: options.comparisons ?? evidence,
    matchers: (options.matchers ?? []).map((matcher, index) => ({
      id: `matcher-${index}`,
      accountId: ACCOUNT,
      definition: matcher.definition,
      isEnabled: matcher.isEnabled,
      conditionsKey: matcher.conditionsKey ?? conditionsKeyFor(matcher.definition),
    })),
    suppressions: options.suppressions ?? [],
  });
}

describe('account matcher discovery', () => {
  it('proposes a matching pattern only with two distinct SMS on two journals', () => {
    const result = discover([
      sms('sms-1', 'journal-1'),
      sms('sms-2', 'journal-2', {
        body: 'Your card ending in 1234 was charged INR 82 at West Market',
        parsedAmount: 82,
        parsedMerchant: 'West Market',
      }),
    ]);

    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].examples.map(example => example.message.id)).toEqual([
      'sms-1',
      'sms-2',
    ]);
    expect(result.proposals[0].definition.sender).toEqual({ op: 'contains', value: 'BANKXYZ' });
    expect(result.proposals[0].definition.body).toEqual({
      kind: 'fragments',
      fragments: ['Your card ending in', '1234', 'was charged'],
    });
  });

  it('skips messages too dense for bounded discovery', () => {
    const body = Array.from({ length: 129 }, () => 'word').join(' ');
    expect(
      discover([sms('dense-1', 'journal-1', { body }), sms('dense-2', 'journal-2', { body })])
        .proposals,
    ).toEqual([]);
  });

  it('does not count duplicate device sources or matching copies with the same digest twice', () => {
    const result = discover([
      sms('sms-1', 'journal-1', { contentDigest: 'same-content' }),
      sms('sms-copy', 'journal-2', {
        deviceSourceId: 'sms-1',
        contentDigest: 'same-content',
      }),
    ]);
    expect(result.proposals).toEqual([]);
  });

  it('deduplicates redelivered content even when the provider source identifiers differ', () => {
    const result = discover([
      sms('sms-1', 'journal-1', { contentDigest: 'same-content' }),
      sms('sms-2', 'journal-2', { contentDigest: 'same-content' }),
    ]);
    expect(result.proposals).toEqual([]);
  });

  it('does not count several messages linked to one journal as independent evidence', () => {
    const result = discover([sms('sms-1', 'journal-1'), sms('sms-2', 'journal-1')]);
    expect(result.proposals).toEqual([]);
  });

  it('does not combine unrelated message structures to meet the threshold', () => {
    const result = discover([
      sms('sms-1', 'journal-1'),
      sms('sms-2', 'journal-2', {
        body: 'Payment complete. Ref AB-9982. Thank you for using River Bank.',
        parsedAmount: undefined,
        parsedMerchant: undefined,
        parsedAccountSource: undefined,
      }),
    ]);
    expect(result.proposals).toEqual([]);
  });

  it('does not invent a sender-only pattern from unrelated bodies with the same token shape', () => {
    const result = discover([
      sms('sms-1', 'journal-1', {
        body: 'alpha beta gamma',
        parsedAmount: undefined,
        parsedMerchant: undefined,
        parsedAccountSource: undefined,
      }),
      sms('sms-2', 'journal-2', {
        body: 'delta epsilon zeta',
        parsedAmount: undefined,
        parsedMerchant: undefined,
        parsedAccountSource: undefined,
      }),
    ]);
    expect(result.proposals).toEqual([]);
  });

  it('keeps longest common token runs with variable gaps between them', () => {
    const result = discover([
      sms('sms-1', 'journal-1', {
        body: 'Notice card ending in 1234 was charged INR 50 at North Cafe',
        parsedAmount: 50,
        parsedMerchant: 'North Cafe',
      }),
      sms('sms-2', 'journal-2', {
        body: 'Notice card ending in 1234 was debited INR 60 at South Shop',
        parsedAmount: 60,
        parsedMerchant: 'South Shop',
      }),
    ]);
    expect(result.proposals[0].definition.body).toEqual({
      kind: 'fragments',
      fragments: ['Notice card ending in', '1234', 'was'],
    });
  });

  it('can propose an observed sender-only condition when linked messages have no body text', () => {
    const result = discover([
      sms('sms-1', 'journal-1', { rawBody: undefined }),
      sms('sms-2', 'journal-2', { rawBody: undefined }),
    ]);
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].definition).toEqual({
      version: 1,
      sender: { op: 'contains', value: 'BANKXYZ' },
    });
  });

  it.each([true, false])(
    'uses covered history but requires a new format, enabled=%s',
    isEnabled => {
      const oldMatcher = {
        version: 1 as const,
        sender: { op: 'contains' as const, value: 'BANKXYZ' },
        body: { kind: 'fragments' as const, fragments: ['Your card ending in', '1234'] },
      };
      const result = discover(
        [
          sms('old-1', 'journal-1'),
          sms('old-2', 'journal-2', {
            body: 'Your card ending in 1234 was charged INR 82 at West Market',
            parsedAmount: 82,
            parsedMerchant: 'West Market',
          }),
          sms('new-1', 'journal-3', {
            body: 'BANKXYZ: card ending in 1234 purchase INR 24 at South Foods',
            parsedAmount: 24,
            parsedMerchant: 'South Foods',
          }),
          sms('new-2', 'journal-4', {
            body: 'BANKXYZ: card ending in 1234 purchase INR 42 at East Foods',
            parsedAmount: 42,
            parsedMerchant: 'East Foods',
          }),
        ],
        { matchers: [{ definition: oldMatcher, isEnabled }] },
      );

      expect(result.proposals).toHaveLength(1);
      expect(result.proposals[0].examples.map(example => example.message.id)).toEqual([
        'new-1',
        'new-2',
      ]);
    },
  );

  it.each([true, false])('does not re-suggest an edited saved pattern, enabled=%s', isEnabled => {
    const evidence = [sms('sms-1', 'journal-1'), sms('sms-2', 'journal-2')];
    const definition = {
      version: 1 as const,
      sender: { op: 'contains' as const, value: ' bankxyz ' },
      body: { kind: 'fragments' as const, fragments: ['ENDING IN', '1234'] },
    };
    const result = discover(evidence, {
      matchers: [
        {
          definition,
          isEnabled,
          conditionsKey: 'old-key-before-edit',
        },
      ],
    });
    expect(result.proposals).toEqual([]);
    expect(result.suppressedProposals).toEqual([]);
  });

  it('does not let a saved pattern on another Account suppress this Account’s suggestions', () => {
    const definition = {
      version: 1 as const,
      sender: { op: 'contains' as const, value: 'BANKXYZ' },
    };
    const result = discoverAccountMatcherProposals({
      accountId: ACCOUNT,
      evidence: [sms('sms-1', 'journal-1'), sms('sms-2', 'journal-2')],
      matchers: [
        {
          id: 'other-matcher',
          accountId: OTHER_ACCOUNT,
          definition,
          conditionsKey: conditionsKeyFor(definition),
          isEnabled: false,
        },
      ],
    });
    expect(result.proposals).toHaveLength(1);
  });

  it('withholds automatic proposals for indistinguishable multi-account journal evidence', () => {
    const ambiguous = [
      sms('sms-1', 'journal-1', {
        body: 'Your payment has been processed',
        parsedAmount: undefined,
        parsedMerchant: undefined,
        parsedAccountSource: undefined,
        linkedAccountIds: [ACCOUNT, OTHER_ACCOUNT],
      }),
      sms('sms-2', 'journal-2', {
        body: 'Your payment has been processed',
        parsedAmount: undefined,
        parsedMerchant: undefined,
        parsedAccountSource: undefined,
        linkedAccountIds: [ACCOUNT, OTHER_ACCOUNT],
      }),
    ];
    expect(discover(ambiguous).proposals).toEqual([]);
  });

  it('filters disabled conditions and preserves dismissed or forgotten restore candidates', () => {
    const [first, second] = [sms('sms-1', 'journal-1'), sms('sms-2', 'journal-2')];
    const generated = discover([first, second]).proposals[0];
    const disabled = discover([first, second], {
      matchers: [{ definition: generated.definition, isEnabled: false }],
    });
    expect(disabled.proposals).toEqual([]);

    const forgotten = discover([first, second], {
      suppressions: [
        { accountId: ACCOUNT, conditionsKey: generated.proposalKey, reason: 'forgotten' },
      ],
    });
    expect(forgotten.proposals).toEqual([]);
    expect(forgotten.suppressedProposals.map(item => item.suppression.reason)).toEqual([
      'forgotten',
    ]);

    const dismissed = discover([first, second], {
      suppressions: [
        { accountId: ACCOUNT, conditionsKey: generated.proposalKey, reason: 'dismissed' },
      ],
    });
    expect(dismissed.proposals).toEqual([]);
    expect(dismissed.suppressedProposals).toHaveLength(1);
  });

  it('labels each supporting example and flags an all-auto-posted proposal', () => {
    const result = discover([
      sms('sms-1', 'journal-1', { processingStatus: InboxProcessingStatus.AUTO_POSTED }),
      sms('sms-2', 'journal-2', { processingStatus: InboxProcessingStatus.AUTO_POSTED }),
    ]);
    expect(result.proposals[0].examples.map(example => example.provenance)).toEqual([
      'auto_posted',
      'auto_posted',
    ]);
    expect(result.proposals[0].allExamplesAutoPosted).toBe(true);
  });
});
