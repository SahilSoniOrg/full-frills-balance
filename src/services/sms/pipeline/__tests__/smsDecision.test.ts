import type { SmsMessage } from '@/modules/expo-sms-inbox';
import { readCaptureMetadata } from '@/src/domain/transaction-intelligence/captureMetadata';
import { compileAccountMatcher } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import type { AccountMatcherFlow, AccountMatcherRecord } from '@/src/types/accountMatcher';
import { InboxProcessingStatus, TransactionType } from '@/src/types/enums';
import { asAccountId, type AccountId } from '@/src/types/ids';
import { makeParsedTx } from '../../__tests__/smsParsedTransaction.helpers';
import { decideSms, projectRecognition } from '../smsDecision';
import type { SmsDecisionContext } from '../smsDecisionContext';
import { computeSmsFingerprint } from '../smsFingerprint';

jest.mock('../smsFingerprint', () => ({
  computeSmsFingerprint: jest.fn(() => 'fingerprint'),
}));

const card = asAccountId('card');
const savings = asAccountId('savings');
const uncategorized = asAccountId('uncategorized-expense');
const occurredAt = 1_700_000_000_000;
const message: SmsMessage = {
  id: 'sms-1',
  address: 'BANK',
  body: 'INR 450 spent on Card XX1234 at MARKET on 06-Nov-2026.',
  date: occurredAt,
};

function matcher(id: string, accountId: AccountId, flow?: AccountMatcherFlow) {
  const record: AccountMatcherRecord = {
    id,
    accountId,
    definition: {
      version: 1,
      sender: { op: 'contains', value: 'BANK' },
      ...(flow ? { flow } : {}),
    },
    isEnabled: true,
    eligible: true,
  };
  return { ...record, compiled: compileAccountMatcher(record) };
}

function context(overrides: Partial<SmsDecisionContext> = {}): SmsDecisionContext {
  return {
    matchers: { matchers: [matcher('card', card)], eligibleAccountIds: [card, savings] },
    sourceAccountCurrency: () => 'INR',
    isFinancialLeaf: id => id === card || id === savings,
    captureEnabled: true,
    captureEnabledAt: occurredAt - 1,
    uncategorizedAccount: () => uncategorized,
    ...overrides,
  };
}

const parsed = makeParsedTx({
  id: message.id,
  address: message.address,
  rawBody: message.body,
  date: message.date,
  amount: 450,
  currencyCode: 'INR',
  merchant: 'MARKET',
});

beforeEach(() => {
  jest.spyOn(Date, 'now').mockReturnValue(occurredAt + 10_000);
  jest.mocked(computeSmsFingerprint).mockClear();
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('recognition-only projection', () => {
  it('suggests the recognized financial account without constructing a journal', () => {
    expect(projectRecognition(message, parsed, context())).toMatchObject({
      recognition: { status: 'recognized', accountIds: [card] },
      suggestedAccounts: { suggestedSourceAccountId: card },
    });
    expect(computeSmsFingerprint).not.toHaveBeenCalled();
  });

  it('keeps competing outgoing roles unresolved', () => {
    const projection = projectRecognition(
      message,
      parsed,
      context({
        matchers: {
          matchers: [
            matcher('card-out', card, 'outgoing'),
            matcher('savings-out', savings, 'outgoing'),
          ],
        },
      }),
    );
    expect(projection.recognition.hold).toBe('contradictory');
    expect(projection.suggestedAccounts).toEqual({});
    expect(computeSmsFingerprint).not.toHaveBeenCalled();
  });
});

describe('automatic capture', () => {
  it('posts a supported new-merchant purchase to Uncategorized with unconfirmed category evidence', () => {
    const decision = decideSms(message, parsed, context(), InboxProcessingStatus.PENDING, true);
    expect(decision.kind).toBe('post');
    if (decision.kind !== 'post') throw new Error('Expected an automatic purchase capture');

    expect(decision.journalData.transactions).toEqual([
      {
        accountId: card,
        amount: 450,
        currencyCode: 'INR',
        transactionType: TransactionType.CREDIT,
      },
      {
        accountId: uncategorized,
        amount: 450,
        currencyCode: 'INR',
        transactionType: TransactionType.DEBIT,
      },
    ]);
    expect(decision.journalData.description).toBe('MARKET');
    expect(decision.journalData.metadata?.originalSmsId).toBe(message.id);
    const capture = readCaptureMetadata(decision.journalData.metadata?.metadataJson);
    expect(capture).toMatchObject({
      merchant: 'MARKET',
      economicKind: 'expense',
      reviewState: 'needs_categorization',
      allocations: [{ accountId: uncategorized, origin: 'uncategorized' }],
      sources: [
        {
          channel: 'sms',
          sourceId: message.id,
          occurredAt,
          fingerprint: expect.stringMatching(/^sha256:[a-f\d]{64}$/),
        },
      ],
    });
    expect(capture?.allocations[0].confirmedAt).toBeUndefined();
  });

  it.each([
    ['disabled capture', { captureEnabled: false }],
    ['missing explicit activation cutoff', { captureEnabledAt: undefined }],
    ['message at activation cutoff', { captureEnabledAt: occurredAt }],
    ['message predating activation', { captureEnabledAt: occurredAt + 1 }],
    ['missing Uncategorized mapping', { uncategorizedAccount: () => undefined }],
    ['financial-account currency mismatch', { sourceAccountCurrency: () => 'USD' }],
    ['ineligible financial account', { isFinancialLeaf: () => false }],
    ['no recognized account', { matchers: { matchers: [] } }],
    [
      'opposing declared account flow',
      { matchers: { matchers: [matcher('card-in', card, 'incoming')] } },
    ],
  ] satisfies [string, Partial<SmsDecisionContext>][])(
    'retains review for %s',
    (_name, overrides) => {
      expect(
        decideSms(message, parsed, context(overrides), InboxProcessingStatus.PENDING, true).kind,
      ).toBe('review');
      expect(computeSmsFingerprint).not.toHaveBeenCalled();
    },
  );

  it('does not post during a review-only/manual scan even when capture is enabled', () => {
    expect(decideSms(message, parsed, context(), InboxProcessingStatus.PENDING, false).kind).toBe(
      'review',
    );
    expect(computeSmsFingerprint).not.toHaveBeenCalled();
  });

  it('keeps an ambiguous parsed amount for review', () => {
    expect(
      decideSms(
        message,
        { ...parsed, amountReliableForCapture: false },
        context(),
        InboxProcessingStatus.PENDING,
        true,
      ),
    ).toMatchObject({ kind: 'review', reason: expect.stringContaining('amount') });
  });

  it.each([undefined, ''])(
    'requires an established currency rather than inheriting one from the account',
    currencyCode => {
      expect(
        decideSms(
          message,
          { ...parsed, currencyCode },
          context(),
          InboxProcessingStatus.PENDING,
          true,
        ).kind,
      ).toBe('review');
    },
  );

  it.each([
    'INR 450 debited from account XX1234.',
    'INR 450 refunded to Card XX1234 at MARKET.',
    'INR 450 purchase on Card XX1234 at MARKET is pending.',
    'INR 450 purchase on Card XX1234 at MARKET failed.',
    'OTP for purchase INR 450 on Card XX1234 at MARKET.',
    'INR 450 transferred by UPI to ALEX.',
  ])('keeps incomplete or economically unresolved messages for review: %s', body => {
    expect(
      decideSms(
        { ...message, body },
        { ...parsed, rawBody: body },
        context(),
        InboxProcessingStatus.PENDING,
        true,
      ).kind,
    ).toBe('review');
  });

  it('retains previously processed or duplicate observations without another posting', () => {
    for (const status of [
      InboxProcessingStatus.IMPORTED,
      InboxProcessingStatus.AUTO_POSTED,
      InboxProcessingStatus.DUPLICATE_FLAGGED,
    ]) {
      expect(decideSms(message, parsed, context(), status, true).kind).toBe('review');
    }
    expect(decideSms(message, parsed, context(), InboxProcessingStatus.DISMISSED, true).kind).toBe(
      'ignore',
    );
    expect(computeSmsFingerprint).not.toHaveBeenCalled();
  });

  it('posts an own-account transfer only when both financial roles are established', () => {
    const transfer = { ...message, body: 'INR 450 transferred from Savings to Card by UPI.' };
    const decision = decideSms(
      transfer,
      { ...parsed, rawBody: transfer.body },
      context({
        matchers: {
          matchers: [
            matcher('savings-out', savings, 'outgoing'),
            matcher('card-in', card, 'incoming'),
          ],
        },
      }),
      InboxProcessingStatus.PENDING,
      true,
    );
    expect(decision.kind).toBe('post');
    if (decision.kind !== 'post') throw new Error('Expected an own-account transfer capture');
    expect(
      decision.journalData.transactions.map(line => [line.accountId, line.transactionType]),
    ).toEqual([
      [savings, TransactionType.CREDIT],
      [card, TransactionType.DEBIT],
    ]);
    expect(readCaptureMetadata(decision.journalData.metadata?.metadataJson)).toMatchObject({
      economicKind: 'transfer',
      reviewState: 'not_applicable',
      allocations: [],
    });
  });

  it('does not choose a transfer account by matcher ordering', () => {
    const transfer = { ...message, body: 'INR 450 transferred by UPI.' };
    for (const matchers of [
      [matcher('card-out', card, 'outgoing'), matcher('savings-out', savings, 'outgoing')],
      [matcher('savings-out', savings, 'outgoing'), matcher('card-out', card, 'outgoing')],
    ]) {
      expect(
        decideSms(
          transfer,
          parsed,
          context({ matchers: { matchers } }),
          InboxProcessingStatus.PENDING,
          true,
        ).kind,
      ).toBe('review');
    }
  });
});
