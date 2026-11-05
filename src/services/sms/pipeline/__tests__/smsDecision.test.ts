import type TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { makeParsedTx } from '../../__tests__/smsParsedTransaction.helpers';
import { InboxProcessingStatus } from '@/src/types/enums';
import { asAccountId } from '@/src/types/ids';
import { decideSms, projectRecognition } from '../smsDecision';
import type { SmsDecisionContext } from '../smsDecisionContext';
import { computeSmsFingerprint } from '../smsFingerprint';

jest.mock('../smsFingerprint', () => ({
  computeSmsFingerprint: jest.fn(() => 'fingerprint'),
}));

const cash = asAccountId('cash');
const food = asAccountId('food');
const message = {
  id: 'sms-1',
  address: 'BANK',
  body: 'Spent 500 at SWIGGY',
  date: 1_700_000_000_000,
};

function rule(disposition: 'auto_post' | 'review' | 'ignore'): TransactionAutoPostRule {
  return {
    id: `rule-${disposition}`,
    senderMatch: 'BANK',
    sourceAccountId: disposition === 'ignore' ? undefined : cash,
    categoryAccountId: disposition === 'ignore' ? undefined : food,
    actionsJson: JSON.stringify({ disposition }),
    priority: 1,
  } as TransactionAutoPostRule;
}

function context(rules: TransactionAutoPostRule[]): SmsDecisionContext {
  return {
    activeRules: rules,
    matchers: { matchers: [] },
    sourceAccountCurrency: () => 'INR',
    isFinancialLeaf: () => false,
  };
}

const parsed = makeParsedTx({
  id: message.id,
  address: message.address,
  rawBody: message.body,
  date: message.date,
  amount: 500,
  merchant: 'SWIGGY',
});

describe('projectRecognition', () => {
  beforeEach(() => {
    jest.mocked(computeSmsFingerprint).mockClear();
  });

  it('projects rule suggestions without a journal or fingerprint', () => {
    const projection = projectRecognition(message, parsed, context([rule('auto_post')]));

    expect(projection).toEqual({
      recognition: { status: 'none', accountIds: [], matcherIds: [] },
      suggestedAccounts: { sourceAccountId: cash, categoryAccountId: food },
    });
    expect(computeSmsFingerprint).not.toHaveBeenCalled();
  });

  it('does not suggest accounts when an ignore rule matches', () => {
    const projection = projectRecognition(message, parsed, context([rule('ignore')]));

    expect(projection.suggestedAccounts).toBeUndefined();
    expect(projection.recognition).toEqual({ status: 'none', accountIds: [], matcherIds: [] });
    expect(computeSmsFingerprint).not.toHaveBeenCalled();
  });
});

describe('decideSms', () => {
  beforeEach(() => {
    jest.mocked(computeSmsFingerprint).mockClear();
  });

  it('builds the journal only when auto-post is allowed', () => {
    const rules = context([rule('auto_post')]);
    const projection = projectRecognition(message, parsed, rules);
    const posted = decideSms(message, parsed, rules, InboxProcessingStatus.PENDING, true);

    expect(posted.kind).toBe('post');
    if (posted.kind !== 'post') return;
    expect(posted.suggestedAccounts).toEqual(projection.suggestedAccounts);
    expect(posted.recognition).toEqual(projection.recognition);
    expect(posted.journalData.currencyCode).toBe('INR');
    expect(posted.journalData.metadata?.metadataJson).toContain('fingerprint');

    const held = decideSms(message, parsed, rules, InboxProcessingStatus.PENDING, false);
    expect(held).toMatchObject({
      kind: 'review',
      suggestedAccounts: projection.suggestedAccounts,
      recognition: projection.recognition,
    });
    expect(computeSmsFingerprint).toHaveBeenCalledTimes(1);
  });

  it('returns ignore for an ignore rule and leaves dismissal to the caller', () => {
    const decision = decideSms(
      message,
      parsed,
      context([rule('ignore')]),
      InboxProcessingStatus.PENDING,
      true,
    );

    expect(decision.kind).toBe('ignore');
    expect(decision).not.toHaveProperty('suggestedAccounts');
  });
});
