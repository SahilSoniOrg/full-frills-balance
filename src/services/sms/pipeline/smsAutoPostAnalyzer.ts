import { SmsMessage } from '@/modules/expo-sms-inbox';
import { accountQueryRepository } from '@/src/data/repositories/account';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { ParsedTransaction, toTransactionDirection } from '@/src/services/ledger/SmsParser';
import { smsRuleEngine } from '@/src/services/sms/SmsRuleEngine';
import { JournalStatus, TransactionType } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import { SmsMatchData } from '@/src/utils/sms/RuleMatcher';
import { computeSmsFingerprint } from './smsFingerprint';
import { AutoPostRuleAnalysis } from './types';

export async function analyzeAutoPost(
  workplaceId: WorkplaceId,
  message: SmsMessage,
  parsed: ParsedTransaction,
  activeRules: TransactionAutoPostRule[],
): Promise<AutoPostRuleAnalysis | null> {
  const matchData: SmsMatchData = {
    senderAddress: message.address,
    rawBody: message.body,
    parsedMerchant: parsed.merchant,
    parsedAccountSource: parsed.accountSource,
    direction: toTransactionDirection(parsed.type),
    parsedCurrencyCode: parsed.currencyCode,
    parsedAmount: parsed.amount,
  };

  for (const rule of activeRules) {
    const definition = smsRuleEngine.getRuleDefinition(rule);
    if (smsRuleEngine.matchesResolvedRule(matchData, definition)) {
      if (definition.actions.disposition === 'ignore') {
        return { disposition: 'ignore', ruleId: rule.id };
      }

      if (definition.actions.disposition === 'review') {
        return { disposition: 'review', ruleId: rule.id };
      }

      const sourceAccountId = definition.actions.sourceAccountId;
      const categoryAccountId = definition.actions.categoryAccountId;

      if (sourceAccountId && categoryAccountId && parsed.amount) {
        const sourceAccount = parsed.currencyCode
          ? null
          : await accountQueryRepository.find(workplaceId, sourceAccountId);
        const inferredCurrency = parsed.currencyCode || sourceAccount?.currencyCode;
        const exactCurrencyFormat = parsed.confidence >= 0.9 && !!parsed.currencyCode;
        const accountScopedFormat =
          parsed.confidence >= 0.82 &&
          parsed.parseReason?.startsWith('Matched SMS format ') &&
          !!sourceAccount?.currencyCode;

        // An explicit currency can stand on its own. An ambiguous symbol such as
        // `$` or `Rs` needs both a matched format and the user's selected account
        // currency; generic fallback extraction stays in review.
        if ((!exactCurrencyFormat && !accountScopedFormat) || !inferredCurrency) {
          return { disposition: 'review', ruleId: rule.id };
        }

        const isExpense = parsed.type === 'debit';
        const journalData: CreateJournalData = {
          journalDate: message.date,
          description: parsed.merchant
            ? `${parsed.merchant}`
            : isExpense
              ? `Expense via ${message.address}`
              : `Income via ${message.address}`,
          notes: '',
          currencyCode: inferredCurrency,
          status: JournalStatus.POSTED,
          metadata: {
            importSource: 'sms',
            originalSmsId: message.id,
            originalSmsSender: message.address,
            originalSmsBody: message.body,
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

        return { disposition: 'auto_post', ruleId: rule.id, createData: { journalData } };
      }
    }
  }

  return null;
}
