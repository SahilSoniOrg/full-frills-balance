import { SmsMessage } from '@/modules/expo-sms-inbox';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { ParsedTransaction, toTransactionDirection } from '@/src/services/ledger/SmsParser';
import { smsRuleEngine } from '@/src/services/sms/SmsRuleEngine';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import { buildSmsMatchData, RuleMatcher } from '@/src/utils/sms/RuleMatcher';
import { computeSmsFingerprint } from './smsFingerprint';

export interface AutoPostRuleAnalysis {
  disposition: 'auto_post' | 'review' | 'ignore';
  ruleId: string;
  createData?: {
    journalData: CreateJournalData;
  };
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
}

/**
 * SMS bodies without a currency marker are denominated in the rule's source account
 * currency; `sourceAccountCurrency` resolves it.
 */
export function analyzeAutoPost(
  message: SmsMessage,
  parsed: ParsedTransaction,
  activeRules: TransactionAutoPostRule[],
  sourceAccountCurrency: (sourceAccountId: AccountId) => string | undefined,
  allowAutoPost = true,
): AutoPostRuleAnalysis | null {
  const matchData = buildSmsMatchData(message.address, message.body, {
    parsedMerchant: parsed.merchant,
    parsedAccountSource: parsed.accountSource,
    direction: toTransactionDirection(parsed.type),
    parsedCurrencyCode: parsed.currencyCode,
    parsedAmount: parsed.amount,
  });

  for (const rule of activeRules) {
    const definition = smsRuleEngine.getRuleDefinition(rule);
    if (RuleMatcher.compileRule(definition)(matchData)) {
      if (definition.actions.disposition === 'ignore') {
        return { disposition: 'ignore', ruleId: rule.id };
      }

      if (definition.actions.disposition === 'review' || !allowAutoPost) {
        return {
          disposition: 'review',
          ruleId: rule.id,
          sourceAccountId: definition.actions.sourceAccountId,
          categoryAccountId: definition.actions.categoryAccountId,
        };
      }

      const sourceAccountId = definition.actions.sourceAccountId;
      const categoryAccountId = definition.actions.categoryAccountId;

      const currencyCode =
        parsed.currencyCode || (sourceAccountId && sourceAccountCurrency(sourceAccountId));

      if (sourceAccountId && categoryAccountId && parsed.amount && currencyCode) {
        const isExpense = parsed.type === 'debit';
        const journalData: CreateJournalData = {
          journalDate: message.date,
          description: parsed.merchant
            ? `${parsed.merchant}`
            : isExpense
              ? 'Expense via SMS'
              : 'Income via SMS',
          notes: '',
          currencyCode,
          status: JournalStatus.POSTED,
          metadata: {
            importSource: 'sms',
            originalSmsId: message.id,
            metadataJson: JSON.stringify({
              smsFingerprint: computeSmsFingerprint(message.address, message.body, message.date),
            }),
          },
          transactions: [
            {
              accountId: sourceAccountId,
              amount: parsed.amount,
              transactionType: isExpense ? TransactionType.CREDIT : TransactionType.DEBIT,
            },
            {
              accountId: categoryAccountId,
              amount: parsed.amount,
              transactionType: isExpense ? TransactionType.DEBIT : TransactionType.CREDIT,
            },
          ],
        };

        return {
          disposition: 'auto_post',
          ruleId: rule.id,
          createData: { journalData },
          sourceAccountId,
          categoryAccountId,
        };
      }
    }
  }

  return null;
}
