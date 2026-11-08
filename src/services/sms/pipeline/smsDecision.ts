import type { SmsMessage } from '@/modules/expo-sms-inbox';
import type { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { recognizeSmsAccounts } from '@/src/services/sms/recognition/accountMatcherEvaluator';
import { summarizeSmsRecognition } from '@/src/services/sms/recognition/smsRecognitionSummary';
import { resolveAccountFlowRoles } from '@/src/services/sms/recognition/accountFlowRoles';
import type { SmsAccountRecognition, SmsRecognitionSummary } from '@/src/types/accountMatcher';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import type { AccountId } from '@/src/types/ids';
import type { CreateJournalData } from '@/src/types/journalWrite';
import { decideCapture } from '@/src/domain/transaction-intelligence/decideCapture';
import {
  readCaptureMetadata,
  withCaptureMetadata,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import { extractSmsEconomicEvidence } from './smsEconomicEvidence';
import type { SmsDecisionContext } from './smsDecisionContext';
import { computeSmsFingerprint } from './smsFingerprint';

interface SuggestedAccounts {
  suggestedSourceAccountId?: AccountId;
  suggestedCategoryAccountId?: AccountId;
}
export interface SmsRecognitionProjection {
  recognition: SmsRecognitionSummary;
  suggestedAccounts?: SuggestedAccounts;
}
export type SmsDecision =
  | { kind: 'ignore'; recognition: SmsRecognitionSummary }
  | {
      kind: 'review';
      recognition: SmsRecognitionSummary;
      suggestedAccounts: SuggestedAccounts;
      reason?: string;
    }
  | {
      kind: 'post';
      recognition: SmsRecognitionSummary;
      suggestedAccounts: SuggestedAccounts;
      journalData: CreateJournalData;
    };

function project(
  recognition: SmsAccountRecognition,
  parsed: ParsedTransaction,
): SmsRecognitionProjection {
  const summary = summarizeSmsRecognition(recognition);
  const roles = resolveAccountFlowRoles(recognition);
  if (summary.hold || roles.isAmbiguous || recognition.status !== 'recognized')
    return { recognition: summary, suggestedAccounts: {} };
  const suggestedAccounts: SuggestedAccounts = recognition.flows?.length
    ? parsed.type === 'debit'
      ? {
          suggestedSourceAccountId: roles.sourceAccountId,
          suggestedCategoryAccountId: roles.destinationAccountId,
        }
      : parsed.type === 'credit'
        ? {
            suggestedSourceAccountId: roles.destinationAccountId,
            suggestedCategoryAccountId: roles.sourceAccountId,
          }
        : {}
    : recognition.accountIds.length === 1
      ? { suggestedSourceAccountId: recognition.accountIds[0] }
      : {};
  return { recognition: summary, suggestedAccounts };
}

export function projectRecognition(
  message: SmsMessage,
  parsed: ParsedTransaction,
  context: SmsDecisionContext,
): SmsRecognitionProjection {
  return project(
    recognizeSmsAccounts(context.matchers, {
      senderAddress: message.address,
      rawBody: message.body,
    }),
    parsed,
  );
}

export function decideSms(
  message: SmsMessage,
  parsed: ParsedTransaction,
  context: SmsDecisionContext,
  processingStatus: InboxProcessingStatus,
  allowAutoPost: boolean,
): SmsDecision {
  const recognition = recognizeSmsAccounts(context.matchers, {
    senderAddress: message.address,
    rawBody: message.body,
  });
  const projected = project(recognition, parsed);
  if (processingStatus === InboxProcessingStatus.DISMISSED)
    return { kind: 'ignore', recognition: projected.recognition };
  const review = (reason?: string): SmsDecision => ({
    kind: 'review',
    recognition: projected.recognition,
    suggestedAccounts: projected.suggestedAccounts ?? {},
    reason,
  });
  if (
    allowAutoPost &&
    processingStatus === InboxProcessingStatus.PENDING &&
    parsed.parseStatus === InboxParseStatus.PARSED &&
    parsed.amountReliableForCapture !== true
  )
    return review('Review the transaction amount; this message contains ambiguous amounts.');
  const roles = resolveAccountFlowRoles(recognition);
  const disposition = decideCapture(
    {
      source: { channel: 'sms', sourceId: message.id, occurredAt: message.date },
      direction: parsed.type,
      amount: parsed.amount,
      currencyCode: parsed.currencyCode,
      merchant: parsed.merchant,
      economicEvidence: extractSmsEconomicEvidence(message.body),
      parsed: parsed.parseStatus === InboxParseStatus.PARSED,
      pending: processingStatus === InboxProcessingStatus.PENDING,
    },
    {
      status: recognition.status,
      accountIds: recognition.accountIds,
      outgoingAccountId: roles.sourceAccountId,
      incomingAccountId: roles.destinationAccountId,
      ambiguous: roles.isAmbiguous || !!projected.recognition.hold,
    },
    {
      enabled: context.captureEnabled === true,
      enabledAt: context.captureEnabledAt,
      allowAutomaticCapture: allowAutoPost,
      sourceAccountCurrency: context.sourceAccountCurrency,
      isFinancialLeaf: context.isFinancialLeaf,
      uncategorizedAccount: context.uncategorizedAccount,
      categoryDefault: context.categoryDefault,
      descriptionDefaults: context.descriptionDefaults,
      openMerchants: context.openMerchants,
    },
    Date.now(),
  );
  if (disposition.kind === 'review') return review(disposition.reason);
  const { journalData } = disposition;
  const fingerprint = computeSmsFingerprint(message.address, message.body, message.date);
  const capture = readCaptureMetadata(journalData.metadata?.metadataJson)!;
  journalData.metadata = {
    importSource: 'sms',
    originalSmsId: message.id,
    metadataJson: withCaptureMetadata(
      JSON.stringify({
        smsFingerprint: fingerprint,
        ...(parsed.referenceNumber ? { referenceNumber: parsed.referenceNumber } : {}),
      }),
      { ...capture, sources: capture.sources.map(source => ({ ...source, fingerprint })) },
    ),
  };
  return {
    kind: 'post',
    recognition: projected.recognition,
    suggestedAccounts: projected.suggestedAccounts ?? {},
    journalData,
  };
}
