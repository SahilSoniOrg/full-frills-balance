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
  /** Journal legs: outgoing source, incoming destination. */
  expected: { sourceAccountId?: AccountId; destinationAccountId?: AccountId };
}

const leaf = (
  id: AccountId,
  name: string,
  accountType = AccountType.ASSET,
): InboxImportParityAccount => ({ id, name, accountType });

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
    name: 'unique recognition takes precedence over a fuzzy source hint',
    direction: 'debit',
    accountSource: 'Card 1990',
    accounts: [leaf(card, 'Card 1990'), leaf(savings, 'Savings')],
    matchers: [matcher('savings', savings)],
    expected: { sourceAccountId: savings, destinationAccountId: undefined },
  },
  {
    name: 'one explicit incoming role remains an incoming draft leg',
    direction: 'debit',
    accounts: [leaf(card, 'Card'), leaf(food, 'Food', AccountType.EXPENSE)],
    matchers: [matcher('card-in', card, 'incoming')],
    expected: { sourceAccountId: undefined, destinationAccountId: card },
  },
  {
    name: 'competing outgoing financial accounts remain unresolved',
    direction: 'debit',
    accountSource: 'Card 1990',
    accounts: [leaf(card, 'Card 1990'), leaf(savings, 'Savings')],
    matchers: [matcher('card-out', card, 'outgoing'), matcher('savings-out', savings, 'outgoing')],
    expected: none,
  },
  {
    name: 'invalid matcher evidence prevents partial prefill',
    direction: 'debit',
    accountSource: 'Card 1990',
    accounts: [leaf(card, 'Card 1990'), leaf(savings, 'Savings')],
    matchers: [
      matcher('invalid', card, undefined, { version: 1 }),
      matcher('savings-out', savings, 'outgoing'),
    ],
    expected: none,
  },
  {
    name: 'two matches without flow declarations do not invent transfer roles',
    direction: 'debit',
    accounts: [leaf(card, 'Card'), leaf(savings, 'Savings')],
    matchers: [matcher('card', card), matcher('savings', savings)],
    expected: none,
  },
  {
    name: 'unique credit recognition fills the incoming financial leg',
    direction: 'credit',
    accounts: [leaf(bank, 'Bank')],
    matchers: [matcher('bank', bank)],
    expected: { sourceAccountId: undefined, destinationAccountId: bank },
  },
  {
    name: 'credit notification of a declared own-account transfer',
    direction: 'credit',
    accounts: [leaf(bank, 'Bank'), leaf(savings, 'Savings')],
    matchers: [matcher('savings-out', savings, 'outgoing'), matcher('bank-in', bank, 'incoming')],
    expected: { sourceAccountId: savings, destinationAccountId: bank },
  },
  {
    name: 'debit notification of a declared own-account transfer',
    direction: 'debit',
    accounts: [leaf(bank, 'Bank'), leaf(savings, 'Savings')],
    matchers: [matcher('savings-out', savings, 'outgoing'), matcher('bank-in', bank, 'incoming')],
    expected: { sourceAccountId: savings, destinationAccountId: bank },
  },
];
