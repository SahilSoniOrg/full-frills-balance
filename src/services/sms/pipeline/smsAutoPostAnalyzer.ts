import { SmsMessage } from '@/modules/expo-sms-inbox';
import { AppConfig } from '@/src/constants';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import { CreateJournalData } from '@/src/data/repositories/journal/journalWriteModule';
import { prepareJournalData } from '@/src/services/ledger/prepareJournalData';
import { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { smsRuleEngine } from '@/src/services/sms/SmsRuleEngine';
import { JournalStatus, TransactionType, WorkplaceId } from '@/src/types/domain';
import { logger } from '@/src/utils/logger';
import { SmsMatchData } from '@/src/utils/sms/RuleMatcher';
import { computeSmsFingerprint, toDirection } from './smsFingerprint';
import { AutoPostRuleAnalysis } from './types';

export async function analyzeAutoPost(
  message: SmsMessage,
  parsed: ParsedTransaction,
  activeRules: TransactionAutoPostRule[],
  workplaceId: WorkplaceId,
): Promise<AutoPostRuleAnalysis | null> {
  const matchData: SmsMatchData = {
    senderAddress: message.address,
    rawBody: message.body,
    parsedMerchant: parsed.merchant,
    parsedAccountSource: parsed.accountSource,
    direction: toDirection(parsed.type),
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
        const isExpense = parsed.type === 'debit';
        const journalData: CreateJournalData = {
          journalDate: message.date,
          description: parsed.merchant
            ? `${parsed.merchant}`
            : isExpense
              ? `Expense via ${message.address}`
              : `Income via ${message.address}`,
          notes: `Auto-posted from SMS rule: ${rule.senderMatch || 'Rule'}`,
          currencyCode: parsed.currencyCode || AppConfig.defaultCurrency,
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

        try {
          const preparedJournal = await prepareJournalData(journalData, workplaceId);
          return {
            disposition: 'auto_post',
            ruleId: rule.id,
            createData: { journalData, preparedJournal },
          };
        } catch (e) {
          logger.warn(`Failed to prepare journal data for auto-post rule ${rule.id}`, {
            error: e,
          });
          return { disposition: 'review', ruleId: rule.id };
        }
      }
    }
  }

  return null;
}
