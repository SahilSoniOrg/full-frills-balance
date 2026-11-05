import { SmsMessage } from '@/modules/expo-sms-inbox';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { ParsedTransaction, toTransactionDirection } from '@/src/services/ledger/SmsParser';
import { smsRuleEngine } from '@/src/services/sms/SmsRuleEngine';
import type { AccountId } from '@/src/types/ids';
import { buildSmsMatchData, RuleMatcher } from '@/src/utils/sms/RuleMatcher';
import { checkRuleCompatibility } from '@/src/services/sms/recognition/accountRuleCompatibility';
import type { SmsAccountRecognition } from '@/src/types/accountMatcher';

/** Rule priority and compatibility. Journal construction stays in decideSms. */
export interface AutoPostRuleAnalysis {
  disposition: 'auto_post' | 'review' | 'ignore';
  ruleId: string;
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
  hold?: 'contradictory' | 'indeterminate';
  /** Set only when the matched rule has everything required to post. */
  currencyCode?: string;
}

/**
 * SMS bodies without a currency marker are denominated in the rule's source account
 * currency; `sourceAccountCurrency` resolves it. Does not build a journal or a fingerprint.
 */
export function analyzeAutoPost(
  message: SmsMessage,
  parsed: ParsedTransaction,
  activeRules: TransactionAutoPostRule[],
  sourceAccountCurrency: (sourceAccountId: AccountId) => string | undefined,
  allowAutoPost = true,
  recognition?: SmsAccountRecognition,
  isFinancialLeaf: (id: AccountId) => boolean = () => false,
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

      const sourceAccountId = definition.actions.sourceAccountId;
      const categoryAccountId = definition.actions.categoryAccountId;

      if (
        recognition &&
        (recognition.flows?.length ||
          (definition.actions.disposition === 'auto_post' && allowAutoPost))
      ) {
        const compatibility = checkRuleCompatibility(
          recognition,
          { sourceAccountId, categoryAccountId },
          isFinancialLeaf,
          toTransactionDirection(parsed.type),
        );
        if (compatibility === 'contradictory' || compatibility === 'indeterminate') {
          return {
            disposition: 'review',
            ruleId: rule.id,
            sourceAccountId,
            categoryAccountId,
            hold: compatibility,
          };
        }
      }

      if (definition.actions.disposition === 'review' || !allowAutoPost) {
        return {
          disposition: 'review',
          ruleId: rule.id,
          sourceAccountId,
          categoryAccountId,
        };
      }

      const currencyCode =
        parsed.currencyCode || (sourceAccountId && sourceAccountCurrency(sourceAccountId));

      if (sourceAccountId && categoryAccountId && parsed.amount && currencyCode) {
        return {
          disposition: 'auto_post',
          ruleId: rule.id,
          sourceAccountId,
          categoryAccountId,
          currencyCode,
        };
      }
    }
  }

  return null;
}
