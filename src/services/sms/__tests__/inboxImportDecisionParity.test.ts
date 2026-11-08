import type { SmsMessage } from '@/modules/expo-sms-inbox';
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

// Scan suggestions store the parser-primary financial account and counterparty.
// Journal navigation always stores outgoing source and incoming destination.
function journalLegs(
  direction: InboxImportParityCase['direction'],
  suggested: { suggestedSourceAccountId?: AccountId; suggestedCategoryAccountId?: AccountId },
) {
  return {
    sourceAccountId:
      direction === 'credit'
        ? suggested.suggestedCategoryAccountId
        : suggested.suggestedSourceAccountId,
    destinationAccountId:
      direction === 'credit'
        ? suggested.suggestedSourceAccountId
        : suggested.suggestedCategoryAccountId,
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

describe('manual import and scan recognition parity', () => {
  it.each(inboxImportDecisionParityCases)('$name', fixture => {
    const message: SmsMessage = parityMessage;
    const accounts = fixture.accounts.map(account => ({ ...account, currencyCode: 'INR' }));
    const financialLeaves = getEligibleMatcherAccountIds(accounts);
    const matchers = { matchers: fixture.matchers, eligibleAccountIds: [...financialLeaves] };
    const recognition = recognizeSmsAccounts(matchers, {
      senderAddress: message.address,
      rawBody: message.body,
    });
    const decision = decideSms(
      message,
      parsedTransaction(fixture),
      {
        matchers,
        sourceAccountCurrency: () => 'INR',
        isFinancialLeaf: id => financialLeaves.has(id),
        uncategorizedAccount: () => undefined,
        captureEnabled: false,
      },
      InboxProcessingStatus.PENDING,
      false,
    );
    if (decision.kind !== 'review')
      throw new Error('Recognition-only evaluation must retain manual review');

    const navigation = prepareTransactionInboxImport(inboxItem(fixture), accounts, {
      recognition,
    }).navigation;

    expect(journalLegs(fixture.direction, decision.suggestedAccounts)).toEqual(fixture.expected);
    expect({
      sourceAccountId: navigation.params.sourceAccountId,
      destinationAccountId: navigation.params.destinationAccountId,
    }).toEqual(fixture.expected);
    expect(navigation.params.description).toBe('Unmatched Merchant');
  });
});
