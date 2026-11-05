import type { SmsMessage } from '@/modules/expo-sms-inbox';
import type { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { recognizeSmsAccounts } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import { summarizeSmsRecognition } from '@/src/services/sms/recognition/smsRecognitionSummary';
import { resolveAccountFlowRoles } from '@/src/services/sms/recognition/accountFlowRoles';
import type { SmsAccountRecognition, SmsRecognitionSummary } from '@/src/types/accountMatcher';
import {
  InboxParseStatus,
  InboxProcessingStatus,
  JournalStatus,
  TransactionType,
} from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { analyzeAutoPost, type AutoPostRuleAnalysis } from './smsAutoPostAnalyzer';
import type { SmsDecisionContext } from './smsDecisionContext';
import { computeSmsFingerprint } from './smsFingerprint';

interface SuggestedAccounts {
  sourceAccountId?: AccountId;
  categoryAccountId?: AccountId;
}

/** Hint projection. `suggestedAccounts` is absent when an ignore rule matches. */
export interface SmsRecognitionProjection {
  recognition: SmsRecognitionSummary;
  suggestedAccounts?: SuggestedAccounts;
}

/** The complete rule/recognition decision; consumers choose which effects are permitted. */
export type SmsDecision =
  | { kind: 'ignore'; recognition: SmsRecognitionSummary }
  | { kind: 'review'; recognition: SmsRecognitionSummary; suggestedAccounts: SuggestedAccounts }
  | {
      kind: 'post';
      recognition: SmsRecognitionSummary;
      suggestedAccounts: SuggestedAccounts;
      ruleId: string;
      journalData: CreateJournalData;
    };

function suggestedAccountsFor(
  recognition: SmsAccountRecognition,
  summary: SmsRecognitionSummary,
  parsed: ParsedTransaction,
  rule: AutoPostRuleAnalysis | null,
): SuggestedAccounts {
  const uniqueAccountId =
    recognition.status === 'recognized' && recognition.accountIds.length === 1
      ? recognition.accountIds[0]
      : undefined;
  if (recognition.flows?.length) {
    const roles = resolveAccountFlowRoles(recognition);
    const knownDirection = parsed.type === 'debit' || parsed.type === 'credit';
    // These fields store the parser-primary financial leg and its counterparty,
    // rather than the actual outgoing/incoming legs used by journal navigation.
    return recognition.status !== 'recognized' ||
      summary.hold ||
      rule?.hold ||
      roles.isAmbiguous ||
      !knownDirection
      ? {}
      : {
          sourceAccountId:
            rule?.sourceAccountId ??
            (parsed.type === 'debit' ? roles.sourceAccountId : roles.destinationAccountId),
          categoryAccountId:
            rule?.categoryAccountId ??
            (parsed.type === 'debit' ? roles.destinationAccountId : roles.sourceAccountId),
        };
  }
  return {
    sourceAccountId: rule?.sourceAccountId ?? (rule?.hold ? undefined : uniqueAccountId),
    categoryAccountId: rule?.categoryAccountId,
  };
}

/** Shared suggestion and hold result. Ignore rules do not suggest accounts. */
function projectRuleRecognition(
  recognition: SmsAccountRecognition,
  parsed: ParsedTransaction,
  rule: AutoPostRuleAnalysis | null,
): SmsRecognitionProjection {
  const summary = summarizeSmsRecognition(recognition);
  if (rule?.disposition === 'ignore') return { recognition: summary };
  return {
    recognition: summarizeSmsRecognition(recognition, rule?.hold),
    suggestedAccounts: suggestedAccountsFor(recognition, summary, parsed, rule),
  };
}

function buildAutoPostJournal(
  message: SmsMessage,
  parsed: ParsedTransaction,
  sourceAccountId: AccountId,
  categoryAccountId: AccountId,
  currencyCode: string,
  amount: number,
): CreateJournalData {
  const isExpense = parsed.type === 'debit';
  return {
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
        amount,
        transactionType: isExpense ? TransactionType.CREDIT : TransactionType.DEBIT,
      },
      {
        accountId: categoryAccountId,
        amount,
        transactionType: isExpense ? TransactionType.DEBIT : TransactionType.CREDIT,
      },
    ],
  };
}

function recognizeMessage(message: SmsMessage, context: SmsDecisionContext): SmsAccountRecognition {
  return recognizeSmsAccounts(context.matchers, {
    senderAddress: message.address,
    rawBody: message.body,
  });
}

/**
 * Recognition and the rule-priority compatibility pass for review hints.
 * Does not build a journal or a fingerprint. Posting permission is not a hint,
 * so compatibility for an auto-post rule still runs.
 */
export function projectRecognition(
  message: SmsMessage,
  parsed: ParsedTransaction,
  context: SmsDecisionContext,
): SmsRecognitionProjection {
  const recognition = recognizeMessage(message, context);
  const rule = analyzeAutoPost(
    message,
    parsed,
    context.activeRules,
    context.sourceAccountCurrency,
    true,
    recognition,
    context.isFinancialLeaf,
  );
  return projectRuleRecognition(recognition, parsed, rule);
}

export function decideSms(
  message: SmsMessage,
  parsed: ParsedTransaction,
  context: SmsDecisionContext,
  processingStatus: InboxProcessingStatus,
  allowAutoPost: boolean,
): SmsDecision {
  const recognition = recognizeMessage(message, context);
  const summary = summarizeSmsRecognition(recognition);
  if (processingStatus === InboxProcessingStatus.DISMISSED) {
    return { kind: 'ignore', recognition: summary };
  }
  if (
    parsed.parseStatus !== InboxParseStatus.PARSED ||
    processingStatus !== InboxProcessingStatus.PENDING
  ) {
    return { kind: 'review', recognition: summary, suggestedAccounts: {} };
  }

  const rule = analyzeAutoPost(
    message,
    parsed,
    context.activeRules,
    context.sourceAccountCurrency,
    allowAutoPost,
    recognition,
    context.isFinancialLeaf,
  );
  const projected = projectRuleRecognition(recognition, parsed, rule);
  if (rule?.disposition === 'ignore') return { kind: 'ignore', recognition: projected.recognition };

  const suggestedAccounts = projected.suggestedAccounts ?? {};
  if (
    rule?.disposition === 'auto_post' &&
    rule.sourceAccountId &&
    rule.categoryAccountId &&
    rule.currencyCode &&
    parsed.amount
  ) {
    return {
      kind: 'post',
      recognition: projected.recognition,
      suggestedAccounts,
      ruleId: rule.ruleId,
      journalData: buildAutoPostJournal(
        message,
        parsed,
        rule.sourceAccountId,
        rule.categoryAccountId,
        rule.currencyCode,
        parsed.amount,
      ),
    };
  }
  return {
    kind: 'review',
    recognition: projected.recognition,
    suggestedAccounts,
  };
}
