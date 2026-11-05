import type { SmsMessage } from '@/modules/expo-sms-inbox';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { getEligibleMatcherAccountIds } from '@/src/services/accounts/accountMatcherEligibility';
import type { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { TransactionInboxItem } from '@/src/types/domainJournal';
import { decideSms } from '../pipeline/smsDecision';
import { recognizeSmsAccounts } from '../recognition/accountMatcherEvaluator';
import { prepareTransactionInboxImport } from '../transactionInboxImport';
import {
  inboxImportDecisionParityCases,
  parityMessage,
  type InboxImportParityCase,
} from './inboxImportDecisionParity.fixtures';

// decideSms stores the parser-primary account on sourceAccountId and its counterparty
// on categoryAccountId. Navigation stores outgoing on sourceAccountId and incoming
// on destinationAccountId, so a credit SMS swaps those two fields.
function journalLegs(
  direction: InboxImportParityCase['direction'],
  suggested: { sourceAccountId?: AccountId; categoryAccountId?: AccountId },
) {
  const sourceAccountId =
    direction === 'credit' ? suggested.categoryAccountId : suggested.sourceAccountId;
  const destinationAccountId =
    direction === 'credit' ? suggested.sourceAccountId : suggested.categoryAccountId;
  return {
    sourceAccountId: sourceAccountId || undefined,
    destinationAccountId: destinationAccountId || undefined,
  };
}

function inboxItem(fixture: InboxImportParityCase): TransactionInboxItem {
  return {
    id: 'inbox-parity',
    channel: 'sms',
    deviceSourceId: parityMessage.id,
    senderAddress: parityMessage.address,
    rawBody: parityMessage.body,
    inputDate: parityMessage.date,
    parseStatus: 'parsed',
    processingStatus: 'pending',
    parsedAmount: 250,
    parsedCurrencyCode: 'INR',
    parsedMerchant: 'Unmatched Merchant',
    parsedAccountSource: fixture.accountSource,
    direction: fixture.direction,
  };
}

function parsedTransaction(fixture: InboxImportParityCase): ParsedTransaction {
  return {
    id: parityMessage.id,
    amount: 250,
    merchant: 'Unmatched Merchant',
    type: fixture.direction,
    date: parityMessage.date,
    rawBody: parityMessage.body,
    address: parityMessage.address,
    accountSource: fixture.accountSource,
    currencyCode: 'INR',
    confidence: 1,
    parseStatus: InboxParseStatus.PARSED,
    parseReason: '',
  };
}

function matchedRule(fixture: InboxImportParityCase): TransactionAutoPostRule | null {
  if (!fixture.rule) return null;
  return {
    id: 'rule-parity',
    senderMatch: 'BANK',
    sourceAccountId: fixture.rule.sourceAccountId,
    categoryAccountId: fixture.rule.categoryAccountId,
    priority: 1,
    isActive: true,
  } as TransactionAutoPostRule;
}

describe('inbox import and decideSms account parity', () => {
  it.each(inboxImportDecisionParityCases)('$name', fixture => {
    const message: SmsMessage = parityMessage;
    const accounts = fixture.accounts.map(account => ({ ...account, currencyCode: 'INR' }));
    const financialLeaves = getEligibleMatcherAccountIds(accounts);
    const recognition = recognizeSmsAccounts(
      { matchers: fixture.matchers, eligibleAccountIds: [...financialLeaves] },
      { senderAddress: message.address, rawBody: message.body },
    );
    const rule = matchedRule(fixture);
    const decision = decideSms(
      message,
      parsedTransaction(fixture),
      {
        activeRules: rule ? [rule] : [],
        matchers: { matchers: fixture.matchers, eligibleAccountIds: [...financialLeaves] },
        sourceAccountCurrency: () => 'INR',
        isFinancialLeaf: id => financialLeaves.has(id),
      },
      InboxProcessingStatus.PENDING,
      true,
    );
    if (decision.kind === 'ignore') {
      throw new Error(`${fixture.name} produced an ignore decision`);
    }

    const fromDecision = journalLegs(fixture.direction, decision.suggestedAccounts);
    const navigation = prepareTransactionInboxImport(inboxItem(fixture), accounts, rule, {
      recognition,
    }).navigation;
    const fromImport = {
      sourceAccountId: navigation.params.sourceAccountId,
      destinationAccountId: navigation.params.destinationAccountId,
    };

    expect(fromDecision).toEqual(fixture.expected);
    expect(fromImport).toEqual(fixture.expected);
  });
});
