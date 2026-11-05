import type {
  AccountMatcherContext,
  AccountMatcherFlow,
  AccountMatcherRecord,
} from '@/src/types/accountMatcher';
import { compileAccountMatcher } from '../recognition/accountMatcherEvaluator';
import { AccountType } from '@/src/types/enums';
import { asAccountId, type AccountId } from '@/src/types/ids';

export const parityMessage = {
  id: 'sms-parity',
  address: 'BANK',
  body: 'Paid 250 at the shop',
  date: 1_700_000_000_000,
};

const card = asAccountId('card');
const savings = asAccountId('savings');
const bank = asAccountId('bank');
const equity = asAccountId('equity');
const food = asAccountId('food');

export interface InboxImportParityAccount {
  id: AccountId;
  name: string;
  accountType: AccountType;
}

export interface InboxImportParityCase {
  name: string;
  direction: 'debit' | 'credit';
  accountSource?: string;
  accounts: InboxImportParityAccount[];
  matchers: AccountMatcherContext['matchers'];
  rule: { sourceAccountId: AccountId; categoryAccountId: AccountId } | null;
  /** Journal legs: outgoing source, incoming destination. */
  expected: { sourceAccountId?: AccountId; destinationAccountId?: AccountId };
}

const leaf = (
  id: AccountId,
  name: string,
  accountType = AccountType.ASSET,
): InboxImportParityAccount => ({
  id,
  name,
  accountType,
});

const matcher = (
  id: string,
  accountId: AccountId,
  flow?: AccountMatcherFlow,
  definition: AccountMatcherRecord['definition'] = {
    version: 1,
    sender: { op: 'contains', value: 'BANK' },
    ...(flow ? { flow } : {}),
  },
) => {
  const record: AccountMatcherRecord = {
    id,
    accountId,
    definition,
    isEnabled: true,
    eligible: true,
  };
  return { ...record, compiled: compileAccountMatcher(record) };
};

const none = { sourceAccountId: undefined, destinationAccountId: undefined };

export const inboxImportDecisionParityCases: InboxImportParityCase[] = [
  {
    name: 'unique recognition with no rule',
    direction: 'debit',
    accountSource: 'Card 1990',
    accounts: [leaf(card, 'Card 1990'), leaf(savings, 'Savings')],
    matchers: [matcher('savings', savings)],
    rule: null,
    expected: { sourceAccountId: savings, destinationAccountId: undefined },
  },
  {
    name: 'contradictory rule',
    direction: 'debit',
    accounts: [leaf(card, 'Card'), leaf(food, 'Food', AccountType.EXPENSE)],
    matchers: [matcher('card-in', card, 'incoming')],
    rule: { sourceAccountId: card, categoryAccountId: food },
    expected: none,
  },
  {
    name: 'ambiguous flows',
    direction: 'debit',
    accountSource: 'Card 1990',
    accounts: [leaf(card, 'Card 1990'), leaf(savings, 'Savings')],
    matchers: [matcher('card-out', card, 'outgoing'), matcher('savings-out', savings, 'outgoing')],
    rule: null,
    expected: none,
  },
  {
    name: 'indeterminate recognition',
    direction: 'debit',
    accountSource: 'Card 1990',
    accounts: [
      leaf(card, 'Card 1990'),
      leaf(savings, 'Savings'),
      leaf(food, 'Food', AccountType.EXPENSE),
    ],
    matchers: [
      matcher('invalid', card, undefined, { version: 1 }),
      matcher('savings-out', savings, 'outgoing'),
    ],
    rule: { sourceAccountId: card, categoryAccountId: food },
    expected: none,
  },
  {
    name: 'equity is not a financial leaf',
    direction: 'debit',
    accounts: [leaf(bank, 'Bank'), leaf(equity, 'Opening balance', AccountType.EQUITY)],
    matchers: [matcher('equity-in', equity, 'incoming')],
    rule: { sourceAccountId: bank, categoryAccountId: equity },
    expected: none,
  },
  {
    name: 'recognized equity without a rule',
    direction: 'debit',
    accounts: [leaf(equity, 'Opening balance', AccountType.EQUITY)],
    matchers: [matcher('equity-in', equity, 'incoming')],
    rule: null,
    expected: { sourceAccountId: undefined, destinationAccountId: equity },
  },
  {
    name: 'credit declared transfer',
    direction: 'credit',
    accounts: [leaf(bank, 'Bank'), leaf(savings, 'Savings')],
    matchers: [matcher('savings-out', savings, 'outgoing'), matcher('bank-in', bank, 'incoming')],
    rule: null,
    expected: { sourceAccountId: savings, destinationAccountId: bank },
  },
  {
    name: 'compatible rule without flows',
    direction: 'debit',
    accounts: [leaf(bank, 'Bank'), leaf(food, 'Food', AccountType.EXPENSE)],
    matchers: [matcher('bank', bank)],
    rule: { sourceAccountId: bank, categoryAccountId: food },
    expected: { sourceAccountId: bank, destinationAccountId: food },
  },
];
