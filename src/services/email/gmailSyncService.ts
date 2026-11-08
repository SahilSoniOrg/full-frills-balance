import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';
import type { WorkplaceId } from '@/src/types/ids';
import { hashLegacySmsFingerprint } from '@/src/utils/smsFingerprintHash';
import { gmailAccessToken, invalidateGmailAccessToken } from './gmailAuthorization';
import { gmailBinding, advanceGmailHistory } from './gmailConnection';
import { preferences } from '@/src/services/preferences';
import { loadAccountMatcherContext } from '@/src/services/accounts/accountMatcherContext';
import { classifyCapture } from '@/src/domain/transaction-intelligence/captureDecision';
import { extractMessageEconomicEvidence } from '@/src/domain/transaction-intelligence/messageEconomicEvidence';
import { resolveAccountFlowRoles } from '@/src/services/sms/recognition/accountFlowRoles';
import { InboxParseStatus } from '@/src/types/enums';
import { recognizeEmailAccounts } from './emailAccountRecognition';
import { parseGmailTransaction } from './parseGmailTransaction';
import { GmailDkimLookupError, verifyGmailDkim } from './gmailDkimVerification';
import {
  GmailApiError,
  UnsupportedGmailContentError,
  gmailHistoryHead,
  listGmailHistory,
  listGmailMessageIds,
  readGmailMessage,
  readGmailRawMessage,
} from './gmailApi';
import { ingestGmailObservation } from './gmailIngestion';
import { analytics } from '@/src/services/analytics';
import { BehaviorSubject } from 'rxjs';
import { logger } from '@/src/utils/logger';

const active = new Map<WorkplaceId, { task: Promise<void>; controller: AbortController }>();
const states = new Map<WorkplaceId, BehaviorSubject<'idle' | 'syncing' | 'ok' | 'error'>>();

/** Read the current state without creating a subscription during render. */
export function getGmailSyncState(workplaceId: WorkplaceId) {
  return states.get(workplaceId)?.value ?? 'idle';
}

export function gmailSyncState(workplaceId: WorkplaceId) {
  let state = states.get(workplaceId);
  if (!state) {
    state = new BehaviorSubject<'idle' | 'syncing' | 'ok' | 'error'>('idle');
    states.set(workplaceId, state);
  }
  return state;
}

async function sync(
  workplaceId: WorkplaceId,
  signal?: AbortSignal,
  retry = true,
  shouldContinue?: () => boolean,
): Promise<void> {
  const binding = gmailBinding(workplaceId);
  if (!binding || signal?.aborted || shouldContinue?.() === false) return;
  logger.debug('[Gmail] Sync started', {
    connectedAt: new Date(binding.connectedAt).toISOString(),
    hasHistoryCursor: !!binding.historyId,
    automaticCaptureEnabled: !!binding.automaticCaptureEnabledAt,
  });
  const credentials = await gmailAccessToken(shouldContinue ? binding.accountId : undefined);
  if (!credentials || credentials.accountId !== binding.accountId)
    throw new Error('Reconnect Gmail for this workplace.');
  const { accessToken } = credentials;
  let matcherContext: Awaited<ReturnType<typeof loadAccountMatcherContext>> | undefined;
  let deferHistoryAdvance = false;
  let capturedCount = 0;
  const processIds = async (ids: readonly string[]) => {
    for (const id of ids) {
      if (signal?.aborted || shouldContinue?.() === false) throw new Error('Gmail sync cancelled.');
      const sourceId = `gmail:${hashLegacySmsFingerprint(`${binding.accountId}:${id}`)}`;
      if (
        (await transactionInboxRepository.findEmailCopies(sourceId)).some(
          copy => copy.workplaceId === workplaceId,
        )
      ) {
        logger.debug('[Gmail] Message skipped', { reason: 'already_in_workplace_inbox' });
        continue;
      }
      try {
        const read = await readGmailMessage(accessToken, id, signal);
        if (read.status === 'retry') {
          deferHistoryAdvance = true;
          logger.debug('[Gmail] Message deferred', { reason: read.reason });
          continue;
        }
        if (read.status === 'skip') {
          logger.debug('[Gmail] Message skipped', { reason: read.reason });
          continue;
        }
        const message = read.message;
        if (message.receivedAt > binding.connectedAt) {
          const current = gmailBinding(workplaceId);
          const capture =
            preferences.workplace.getSnapshot(workplaceId).automaticTransactionCapture;
          if (
            current?.accountId === binding.accountId &&
            current.connectedAt === binding.connectedAt &&
            current.automaticCaptureEnabledAt &&
            capture?.enabled &&
            capture.enabledAt &&
            message.receivedAt > Math.max(current.automaticCaptureEnabledAt, capture.enabledAt)
          ) {
            const parsed = await parseGmailTransaction(message);
            logger.debug('[Gmail] Automatic capture prerequisites', {
              primaryPlainText: !!message.primaryPlainText,
              transactionDetected: !!parsed,
              parsed: parsed?.parseStatus === InboxParseStatus.PARSED,
              amountReliable: !!parsed?.amountReliableForCapture,
              hasAmount: !!parsed?.amount,
              hasCurrency: !!parsed?.currencyCode,
              hasReference: !!parsed?.referenceNumber,
            });
            if (
              message.primaryPlainText &&
              parsed?.parseStatus === InboxParseStatus.PARSED &&
              parsed.amountReliableForCapture &&
              parsed.amount &&
              parsed.currencyCode &&
              parsed.referenceNumber
            ) {
              matcherContext ??= await loadAccountMatcherContext(workplaceId);
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
              if (classification.kind !== 'review') {
                const raw = await readGmailRawMessage(accessToken, id, signal);
                if (raw) {
                  try {
                    message.authenticated = await verifyGmailDkim({
                      raw,
                      sender: message.sender,
                      recipient: credentials.email,
                      receivedAt: message.receivedAt,
                      topLevelMimeType: message.topLevelMimeType,
                      signal,
                    });
                    logger.debug('[Gmail] Signature verification', {
                      verified: message.authenticated,
                    });
                  } catch (error) {
                    // DNS/key lookup failures must not abort the mailbox sync or skip ingest.
                    message.authenticated = false;
                    logger.debug('[Gmail] Signature verification', {
                      verified: false,
                      reason:
                        error instanceof GmailDkimLookupError ? 'lookup_failed' : 'verify_failed',
                    });
                  }
                } else
                  logger.debug('[Gmail] Signature verification skipped', {
                    reason: 'raw_unavailable',
                  });
              }
            }
          } else
            logger.debug('[Gmail] Automatic capture skipped', {
              reason: 'disabled_or_before_capture_cutoff',
            });
          const journalResult = await ingestGmailObservation(
            workplaceId,
            binding.accountId,
            binding.connectedAt,
            message,
            signal,
            shouldContinue,
          );
          if (journalResult) capturedCount += 1;
        } else logger.debug('[Gmail] Message skipped', { reason: 'before_connection_cutoff' });
      } catch (error) {
        if (
          error instanceof UnsupportedGmailContentError ||
          (error instanceof GmailApiError && error.status === 404)
        ) {
          logger.debug('[Gmail] Message skipped', {
            reason:
              error instanceof UnsupportedGmailContentError
                ? 'unsupported_content'
                : 'message_not_found',
          });
          continue;
        }
        throw error;
      }
    }
  };
  let nextHistoryId: string | undefined;
  try {
    if (!binding.historyId) throw new GmailApiError(404);
    logger.debug('[Gmail] Scanning mailbox history');
    let pageToken: string | undefined;
    do {
      const page = await listGmailHistory(accessToken, binding.historyId, pageToken, signal);
      logger.debug('[Gmail] History page', {
        messageCount: page.ids.length,
        hasNextPage: !!page.nextPageToken,
      });
      await processIds(page.ids);
      pageToken = page.nextPageToken;
      nextHistoryId = page.historyId ?? nextHistoryId;
    } while (pageToken);
  } catch (error) {
    if (error instanceof GmailApiError && error.status === 401 && retry && !signal?.aborted) {
      await invalidateGmailAccessToken(accessToken);
      return sync(workplaceId, signal, false, shouldContinue);
    }
    if (!(error instanceof GmailApiError) || error.status !== 404) throw error;
    logger.debug('[Gmail] Scanning from connection cutoff', {
      reason: binding.historyId ? 'history_expired' : 'initial_sync',
    });
    try {
      // History may expire; record a head before scanning so arrivals during recovery are replayed.
      nextHistoryId = await gmailHistoryHead(accessToken, signal);
      let pageToken: string | undefined;
      do {
        const page = await listGmailMessageIds(accessToken, binding.connectedAt, pageToken, signal);
        logger.debug('[Gmail] Recovery page', {
          messageCount: page.ids.length,
          hasNextPage: !!page.nextPageToken,
        });
        await processIds(page.ids);
        pageToken = page.nextPageToken;
      } while (pageToken);
    } catch (recoveryError) {
      if (
        recoveryError instanceof GmailApiError &&
        recoveryError.status === 401 &&
        retry &&
        !signal?.aborted
      ) {
        await invalidateGmailAccessToken(accessToken);
        return sync(workplaceId, signal, false, shouldContinue);
      }
      throw recoveryError;
    }
  }
  if (capturedCount > 0)
    analytics.trackFeatureUsage('transaction_capture', 'captured', {
      count: capturedCount,
      channel: 'email',
    });
  if (!nextHistoryId || signal?.aborted || shouldContinue?.() === false) return;
  if (deferHistoryAdvance) {
    logger.debug('[Gmail] History cursor deferred', { reason: 'retryable_message_unread' });
    return;
  }
  await runAccountingWriteSession(async () => {
    if (!signal?.aborted && shouldContinue?.() !== false)
      advanceGmailHistory(workplaceId, binding, nextHistoryId!);
  });
  logger.debug('[Gmail] Sync completed');
}

/** Coalesce foreground requests; Gmail history and idempotent inbox rows make retries safe. */
export function syncGmailForWorkplace(
  workplaceId: WorkplaceId,
  signal?: AbortSignal,
  shouldContinue?: () => boolean,
): Promise<void> {
  const current = active.get(workplaceId);
  if (current) return current.task;
  const controller = new AbortController();
  const state = gmailSyncState(workplaceId);
  state.next('syncing');
  const abort = () => controller.abort();
  if (signal?.aborted) controller.abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const task = sync(workplaceId, controller.signal, true, shouldContinue)
    .then(
      () => {
        state.next(controller.signal.aborted ? 'idle' : 'ok');
        if (!controller.signal.aborted)
          analytics.trackFeatureUsage('gmail', 'sync', { status: 'success' });
      },
      error => {
        state.next(controller.signal.aborted ? 'idle' : 'error');
        logger.debug('[Gmail] Sync failed', {
          reason: controller.signal.aborted
            ? 'cancelled'
            : error instanceof GmailApiError
              ? `http_${error.status}`
              : 'sync_error',
        });
        if (!controller.signal.aborted)
          analytics.trackFeatureUsage('gmail', 'sync', { status: 'failed' });
        throw error;
      },
    )
    .finally(() => {
      signal?.removeEventListener('abort', abort);
      if (active.get(workplaceId)?.task === task) active.delete(workplaceId);
    });
  active.set(workplaceId, { task, controller });
  return task;
}

export function cancelGmailSync(workplaceId: WorkplaceId): void {
  active.get(workplaceId)?.controller.abort();
}
