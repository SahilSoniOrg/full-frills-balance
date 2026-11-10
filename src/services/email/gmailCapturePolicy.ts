import { classifyCapture } from '@/src/domain/transaction-intelligence/captureDecision';
import { extractMessageEconomicEvidence } from '@/src/domain/transaction-intelligence/messageEconomicEvidence';
import { loadAccountMatcherContext } from '@/src/services/accounts/accountMatcherContext';
import { preferences } from '@/src/services/preferences';
import { resolveAccountFlowRoles } from '@/src/services/sms/recognition/accountFlowRoles';
import { InboxParseStatus } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import { logger } from '@/src/utils/logger';
import type { GmailObservation } from './gmailApi';
import { readGmailRawMessage } from './gmailApi';
import { gmailBinding } from './gmailConnection';
import { GmailDkimLookupError, verifyGmailDkim } from './gmailDkimVerification';
import { recognizeEmailAccounts } from './emailAccountRecognition';
import type { parseGmailTransaction } from './parseGmailTransaction';

type ParsedGmailTransaction = NonNullable<Awaited<ReturnType<typeof parseGmailTransaction>>>;

/** Single cutoff for Gmail automatic capture eligibility. */
export function gmailAutomaticCaptureCutoff(input: {
  captureEnabledAt?: number;
  automaticCaptureEnabledAt?: number;
  connectedAt: number;
}): number {
  return Math.max(
    input.captureEnabledAt ?? 0,
    input.automaticCaptureEnabledAt ?? 0,
    input.connectedAt,
  );
}

/**
 * When authentication is unknown, verify DKIM only if capture could otherwise auto-post.
 * Leaves `authenticated` unset when verification is not worth the round trip.
 */
export async function ensureGmailMessageAuthenticated(input: {
  workplaceId: WorkplaceId;
  accountId: string;
  connectedAt: number;
  message: GmailObservation;
  parsed: ParsedGmailTransaction;
  accessToken?: string;
  recipientEmail?: string;
  signal?: AbortSignal;
}): Promise<void> {
  const { message, parsed } = input;
  if (message.authenticated !== undefined) return;

  const binding = gmailBinding(input.workplaceId);
  const capture = preferences.workplace.getSnapshot(input.workplaceId).automaticTransactionCapture;
  if (
    !binding ||
    binding.accountId !== input.accountId ||
    binding.connectedAt !== input.connectedAt ||
    !binding.automaticCaptureEnabledAt ||
    !capture?.enabled ||
    !capture.enabledAt ||
    message.receivedAt <=
      gmailAutomaticCaptureCutoff({
        captureEnabledAt: capture.enabledAt,
        automaticCaptureEnabledAt: binding.automaticCaptureEnabledAt,
        connectedAt: input.connectedAt,
      })
  ) {
    logger.debug('[Gmail] Automatic capture skipped', {
      reason: 'disabled_or_before_capture_cutoff',
    });
    return;
  }

  logger.debug('[Gmail] Automatic capture prerequisites', {
    primaryPlainText: !!message.primaryPlainText,
    transactionDetected: true,
    parsed: parsed.parseStatus === InboxParseStatus.PARSED,
    amountReliable: !!parsed.amountReliableForCapture,
    hasAmount: !!parsed.amount,
    hasCurrency: !!parsed.currencyCode,
    hasReference: !!parsed.referenceNumber,
  });

  if (
    !message.primaryPlainText ||
    parsed.parseStatus !== InboxParseStatus.PARSED ||
    !parsed.amountReliableForCapture ||
    !parsed.amount ||
    !parsed.currencyCode ||
    !parsed.referenceNumber ||
    !input.accessToken ||
    !input.recipientEmail
  )
    return;

  const matcherContext = await loadAccountMatcherContext(input.workplaceId);
  const recognition = recognizeEmailAccounts(matcherContext, message);
  const roles = resolveAccountFlowRoles(recognition);
  const classification = classifyCapture(
    extractMessageEconomicEvidence(message.text),
    parsed.direction,
    {
      status: recognition.status,
      accountIds: recognition.accountIds,
      outgoingAccountId: roles.sourceAccountId,
      incomingAccountId: roles.destinationAccountId,
      ambiguous: roles.isAmbiguous,
    },
  );
  logger.debug('[Gmail] Account recognition and classification', {
    recognition: recognition.status,
    ambiguousRoles: roles.isAmbiguous,
    classification: classification.kind,
  });
  if (classification.kind === 'review') return;

  const raw = await readGmailRawMessage(input.accessToken, message.id, input.signal);
  if (!raw) {
    logger.debug('[Gmail] Signature verification skipped', { reason: 'raw_unavailable' });
    return;
  }
  try {
    message.authenticated = await verifyGmailDkim({
      raw,
      sender: message.sender,
      recipient: input.recipientEmail,
      receivedAt: message.receivedAt,
      topLevelMimeType: message.topLevelMimeType,
      signal: input.signal,
    });
    logger.debug('[Gmail] Signature verification', { verified: message.authenticated });
  } catch (error) {
    // DNS/key lookup failures must not abort the mailbox sync or skip ingest.
    message.authenticated = false;
    logger.debug('[Gmail] Signature verification', {
      verified: false,
      reason: error instanceof GmailDkimLookupError ? 'lookup_failed' : 'verify_failed',
    });
  }
}
