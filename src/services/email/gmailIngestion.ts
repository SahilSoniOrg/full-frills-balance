import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import { stageLinkedCaptureSource } from '@/src/data/repositories/journal/captureSourceLinkStaging';
import {
  findCaptureReferenceMatches,
  findCaptureReferenceCandidates,
} from '@/src/data/repositories/journal/CaptureReferenceMatchQueries';
import { decideCapture } from '@/src/domain/transaction-intelligence/decideCapture';
import { extractMessageEconomicEvidence } from '@/src/domain/transaction-intelligence/messageEconomicEvidence';
import { loadCaptureContext } from '@/src/services/transaction-intelligence/captureContext';
import { journalPersistenceService } from '@/src/services/journal/JournalPersistenceService';
import {
  applyEvidenceDrivenObservationSettlement,
  movementObservationFromCapture,
} from '@/src/services/planned-payment/evidenceDrivenObservationSettlement';
import { recognizeEmailAccounts } from './emailAccountRecognition';
import { resolveAccountFlowRoles } from '@/src/services/sms/recognition/accountFlowRoles';
import { findManyDuplicateCandidates } from '@/src/services/sms/smsDuplicateDetection';
import { normalizeSmsReferenceNumber } from '@/src/utils/sms/SmsReferenceExtractor';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import { InboxParseStatus, InboxProcessingStatus } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import type { TransactionInboxRecordWriteData } from '@/src/types/smsInbox';
import type { GmailObservation } from './gmailApi';
import { ensureGmailMessageAuthenticated, gmailAutomaticCaptureCutoff } from './gmailCapturePolicy';
import { gmailBinding } from './gmailConnection';
import { parseGmailTransaction } from './parseGmailTransaction';
import { buildEmailRecognitionEvidence } from './emailRecognitionEvidence';
import { logger } from '@/src/utils/logger';

export interface IngestGmailObservationOptions {
  signal?: AbortSignal;
  shouldContinue?: () => boolean;
  accessToken?: string;
  recipientEmail?: string;
}

/** A Gmail message is evaluated and linked or posted in one serialized write. */
export async function ingestGmailObservation(
  workplaceId: WorkplaceId,
  accountId: string,
  connectedAt: number,
  message: GmailObservation,
  options: IngestGmailObservationOptions = {},
): Promise<boolean> {
  const { signal, shouldContinue, accessToken, recipientEmail } = options;
  if (message.receivedAt <= connectedAt || signal?.aborted || shouldContinue?.() === false)
    return false;
  const parsed = await parseGmailTransaction(message);
  if (!parsed) {
    logger.debug('[Gmail] Message skipped', { reason: 'no_transaction_direction' });
    return false;
  }
  logger.debug('[Gmail] Transaction parsed', {
    direction: parsed.direction,
    parseStatus: parsed.parseStatus,
    amountReliable: parsed.amountReliableForCapture,
    hasAmount: !!parsed.amount,
    hasCurrency: !!parsed.currencyCode,
    hasMerchant: !!parsed.merchant,
    hasAccountHint: !!parsed.accountSource,
    hasReference: !!parsed.referenceNumber,
  });
  await ensureGmailMessageAuthenticated({
    workplaceId,
    accountId,
    connectedAt,
    message,
    parsed,
    accessToken,
    recipientEmail,
    signal,
  });
  if (signal?.aborted || shouldContinue?.() === false) return false;
  const sourceId = `gmail:${hashLegacySmsFingerprint(`${accountId}:${message.id}`)}`;
  const reference = parsed.referenceNumber
    ? normalizeSmsReferenceNumber(parsed.referenceNumber)
    : undefined;
  const journalResult = await runAccountingWriteSession(async session => {
    const binding = gmailBinding(workplaceId);
    if (
      !binding ||
      binding.accountId !== accountId ||
      binding.connectedAt !== connectedAt ||
      signal?.aborted ||
      shouldContinue?.() === false
    )
      return undefined;
    const copies = await transactionInboxRepository.findEmailCopies(sourceId);
    if (copies.some(copy => copy.workplaceId === workplaceId)) return undefined;
    // Any copy in another workplace (including PENDING) blocks auto-post/link for this one.
    const consumedElsewhere = copies.some(copy => copy.workplaceId !== workplaceId);
    const context = await loadCaptureContext(workplaceId);
    const captureCutoff = gmailAutomaticCaptureCutoff({
      captureEnabledAt: context.captureEnabledAt,
      automaticCaptureEnabledAt: binding.automaticCaptureEnabledAt,
      connectedAt,
    });
    const verifiedForCapture =
      message.authenticated === true &&
      parsed.amountReliableForCapture &&
      context.captureEnabled === true &&
      !!context.captureEnabledAt &&
      !!binding.automaticCaptureEnabledAt &&
      message.receivedAt > captureCutoff;
    const recognition = recognizeEmailAccounts(context.matchers, message);
    const recognitionEvidence = buildEmailRecognitionEvidence(context.matchers, recognition);
    const roles = resolveAccountFlowRoles(recognition);
    const exact =
      !consumedElsewhere &&
      reference &&
      parsed.amount &&
      parsed.currencyCode &&
      recognition.status === 'recognized' &&
      !roles.isAmbiguous
        ? [
            ...new Map(
              (
                await Promise.all(
                  recognition.accountIds.map(accountId =>
                    findCaptureReferenceMatches({
                      workplaceId,
                      reference,
                      amount: parsed.amount!,
                      currencyCode: parsed.currencyCode!,
                      accountId,
                      direction: parsed.direction,
                      receivedAt: message.receivedAt,
                      requireOtherObservation: true,
                    }),
                  ),
                )
              )
                .flat()
                .map(journal => [journal.id, journal]),
            ).values(),
          ]
        : [];
    const referenceCandidates =
      reference && parsed.amount && parsed.currencyCode
        ? await findCaptureReferenceCandidates({
            workplaceId,
            reference,
            amount: parsed.amount,
            currencyCode: parsed.currencyCode,
          })
        : [];
    const pseudoMessage = {
      id: sourceId,
      address: message.sender,
      body: message.text,
      date: message.receivedAt,
    };
    const pseudoParsed = {
      id: sourceId,
      amount: parsed.amount,
      merchant: parsed.merchant,
      type: parsed.direction,
      date: message.receivedAt,
      rawBody: message.text,
      address: message.sender,
      accountSource: parsed.accountSource,
      referenceNumber: reference,
      currencyCode: parsed.currencyCode,
      confidence: 0,
      parseStatus: parsed.parseStatus,
      parseReason: '',
    };
    const fuzzy = parsed.amount
      ? (
          await findManyDuplicateCandidates(
            [{ message: pseudoMessage, parsed: pseudoParsed }],
            workplaceId,
          )
        ).get(sourceId)
      : null;
    const compatibleReference = referenceCandidates[0];
    const duplicateId =
      exact.length > 0 ? exact[0].id : (compatibleReference?.id ?? fuzzy?.journalId);
    const now = Date.now();
    let status =
      parsed.parseStatus === InboxParseStatus.PARSE_FAILED
        ? InboxProcessingStatus.PARSE_FAILED
        : InboxProcessingStatus.PENDING;
    let linkedJournalId = exact.length === 1 && verifiedForCapture ? exact[0].id : undefined;
    let reviewReason: string | undefined;
    let result: Awaited<ReturnType<typeof journalPersistenceService.putInSession>> | undefined;
    if (linkedJournalId) {
      status = InboxProcessingStatus.IMPORTED;
      await stageLinkedCaptureSource(session, workplaceId, linkedJournalId, {
        channel: 'email',
        sourceId,
        occurredAt: message.receivedAt,
        merchant: parsed.merchant,
        authentication: 'dkim',
      });
    } else if (duplicateId) {
      status = InboxProcessingStatus.DUPLICATE_FLAGGED;
    } else if (!consumedElsewhere) {
      const captureObservation = {
        source: {
          channel: 'email' as const,
          sourceId,
          occurredAt: message.receivedAt,
          merchant: parsed.merchant,
          authentication: verifiedForCapture ? ('dkim' as const) : undefined,
        },
        direction: parsed.direction,
        amount: parsed.amount,
        currencyCode: parsed.currencyCode,
        merchant: parsed.merchant,
        economicEvidence: extractMessageEconomicEvidence(message.text),
        parsed: parsed.parseStatus === InboxParseStatus.PARSED,
        pending: true,
      };
      const captureAccounts = {
        status: recognition.status,
        accountIds: recognition.accountIds,
        outgoingAccountId: roles.sourceAccountId,
        incomingAccountId: roles.destinationAccountId,
        ambiguous: roles.isAmbiguous,
      };
      const capturePolicy = {
        enabled: context.captureEnabled === true,
        enabledAt: captureCutoff,
        allowAutomaticCapture: verifiedForCapture,
        sourceAccountCurrency: context.sourceAccountCurrency,
        isFinancialLeaf: context.isFinancialLeaf,
        uncategorizedAccount: context.uncategorizedAccount,
        categoryDefault: context.categoryDefault,
        descriptionDefaults: context.descriptionDefaults,
        openMerchants: context.openMerchants,
      };
      const evidenceAccountId =
        roles.sourceAccountId ??
        roles.destinationAccountId ??
        (recognition.status === 'recognized' && recognition.accountIds.length === 1
          ? recognition.accountIds[0]
          : undefined);
      let evidenceHandled = false;
      if (
        evidenceAccountId &&
        parsed.amount != null &&
        parsed.currencyCode &&
        parsed.parseStatus === InboxParseStatus.PARSED
      ) {
        const evidence = await applyEvidenceDrivenObservationSettlement({
          session,
          workplaceId,
          observation: movementObservationFromCapture({
            id: sourceId,
            channel: 'email',
            amount: parsed.amount,
            currency: parsed.currencyCode,
            accountId: evidenceAccountId,
            direction: parsed.direction,
            date: message.receivedAt,
            reference: reference ?? null,
          }),
          captureGate: {
            observation: captureObservation,
            accounts: captureAccounts,
            policy: capturePolicy,
            now,
          },
        });
        if (evidence.kind === 'settled' || evidence.kind === 'linked') {
          linkedJournalId = evidence.journalId;
          status = InboxProcessingStatus.IMPORTED;
          if (evidence.kind === 'settled') result = evidence.journalResult;
          // Hard identity already staged (or no-op'd) inside settlement — do not stage twice.
          if (!(evidence.kind === 'linked' && evidence.hardIdentity)) {
            await stageLinkedCaptureSource(session, workplaceId, linkedJournalId, {
              channel: 'email',
              sourceId,
              occurredAt: message.receivedAt,
              merchant: parsed.merchant,
              authentication: 'dkim',
            });
          }
          evidenceHandled = true;
        } else if (evidence.kind === 'review') {
          evidenceHandled = true;
          reviewReason = evidence.reason;
          if (evidence.flagDuplicate) {
            status = InboxProcessingStatus.DUPLICATE_FLAGGED;
          } else {
            status = InboxProcessingStatus.PENDING;
          }
        }
      }
      if (!evidenceHandled) {
        const decision = decideCapture(captureObservation, captureAccounts, capturePolicy, now);
        if (decision.kind === 'review')
          reviewReason = !parsed.amountReliableForCapture
            ? 'Review the transaction amount; this email contains ambiguous amounts.'
            : recognition.status === 'none'
              ? 'No account was recognized. Choose the account used for this transaction.'
              : (decision.reason ?? 'Review this email before creating a journal.');
        if (decision.kind === 'post') {
          if (reference && decision.journalData.metadata?.metadataJson) {
            decision.journalData.metadata.metadataJson = JSON.stringify({
              ...JSON.parse(decision.journalData.metadata.metadataJson),
              referenceNumber: reference,
            });
          }
          result = await journalPersistenceService.putInSession(
            session,
            decision.journalData,
            workplaceId,
            { eventType: 'journal.automatically_captured', source: 'system', undoable: false },
          );
          linkedJournalId = result.journal.id;
          status = InboxProcessingStatus.AUTO_POSTED;
        }
      }
    }
    const data: TransactionInboxRecordWriteData = {
      workplaceId,
      channel: 'email',
      deviceSourceId: sourceId,
      senderAddress: message.sender,
      inputDate: message.receivedAt,
      inputFingerprint: sourceId,
      parseStatus: parsed.parseStatus,
      parsedAmount: parsed.amount,
      parsedCurrencyCode: parsed.currencyCode,
      parsedMerchant: parsed.merchant,
      parsedAccountSource: parsed.accountSource,
      referenceNumber: reference,
      direction: parsed.direction,
      processingStatus: status,
      linkedJournalId,
      duplicateJournalId:
        status === InboxProcessingStatus.DUPLICATE_FLAGGED ? duplicateId : undefined,
      duplicateConfidence:
        status === InboxProcessingStatus.DUPLICATE_FLAGGED
          ? exact.length > 0 || compatibleReference
            ? 1
            : fuzzy?.score
          : undefined,
      parseReason: consumedElsewhere
        ? 'This email was already handled in another workplace.'
        : status === InboxProcessingStatus.PENDING || status === InboxProcessingStatus.PARSE_FAILED
          ? (reviewReason ?? 'Email transaction needs review.')
          : undefined,
      metadataJson: JSON.stringify({
        emailSubject: message.subject.slice(0, 500),
        gmailMessageId: message.id,
        ...(message.internetMessageId ? { internetMessageId: message.internetMessageId } : {}),
        ...(status === InboxProcessingStatus.DUPLICATE_FLAGGED
          ? {
              duplicateReasons: reviewReason
                ? [reviewReason]
                : ['A similar transaction was already recorded'],
            }
          : {}),
        ...(reviewReason && status === InboxProcessingStatus.PENDING
          ? { captureAutoPostBlocked: true, captureReviewReason: reviewReason }
          : {}),
        ...(recognitionEvidence ? { emailRecognition: recognitionEvidence } : {}),
      }),
      firstSeenAt: now,
      lastScannedAt: now,
    };
    await transactionInboxRepository.stageEmailInSession(session, data);
    logger.debug('[Gmail] Inbox outcome staged', {
      status,
      recognition: recognition.status,
      ambiguousRoles: roles.isAmbiguous,
      verifiedForCapture,
      consumedElsewhere,
    });
    if (signal?.aborted || shouldContinue?.() === false) throw new Error('Gmail sync cancelled.');
    return result;
  });
  if (journalResult) journalPersistenceService.afterAtomicWriteCommit([journalResult], workplaceId);
  return !!journalResult;
}
