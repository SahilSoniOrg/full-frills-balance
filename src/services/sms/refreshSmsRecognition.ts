import type { SmsMessage } from '@/modules/expo-sms-inbox';
import { deviceSmsInboxRepository } from '@/src/data/repositories/DeviceSmsInboxRepository';
import { transactionInboxRepository } from '@/src/data/repositories/TransactionInboxRepository';
import { preferences } from '@/src/services/preferences';
import type { ParsedTransaction } from '@/src/services/ledger/SmsParser';
import { InboxParseStatus, TransactionDirection } from '@/src/types/enums';
import type { WorkplaceId } from '@/src/types/ids';
import type { InboxRecordSnapshot } from '@/src/types/smsInbox';
import { logger } from '@/src/utils/logger';
import { BehaviorSubject } from 'rxjs';
import { runAccountingWriteSession } from '@/src/data/repositories/AccountingWriteSession';

import { projectRecognition } from './pipeline/smsDecision';
import { loadSmsDecisionContext } from './pipeline/smsDecisionContext';

const BATCH_SIZE = 200;

export type RecognitionRefreshState = 'ready' | 'updating' | 'failed';

type WorkplaceRecognition = {
  generation: number;
  activeMutations: number;
  state?: BehaviorSubject<RecognitionRefreshState>;
};

/** Generation and overlapping matcher edits, with one published refresh state. */
class RecognitionCoordinator {
  private readonly workplaces = new Map<WorkplaceId, WorkplaceRecognition>();

  private ensure(workplaceId: WorkplaceId): WorkplaceRecognition {
    let slot = this.workplaces.get(workplaceId);
    if (!slot) {
      slot = {
        generation: 0,
        activeMutations: 0,
      };
      this.workplaces.set(workplaceId, slot);
    }
    return slot;
  }

  slot(workplaceId: WorkplaceId): WorkplaceRecognition {
    return this.ensure(workplaceId);
  }

  state(workplaceId: WorkplaceId): BehaviorSubject<RecognitionRefreshState> {
    const slot = this.ensure(workplaceId);
    if (!slot.state) {
      slot.state = new BehaviorSubject<RecognitionRefreshState>(
        preferences.workplace.getSnapshot(workplaceId).accountMatcherRefreshPending
          ? 'failed'
          : 'ready',
      );
    }
    return slot.state;
  }
}

const recognitionCoordinator = new RecognitionCoordinator();

export function recognitionRefreshState(workplaceId: WorkplaceId) {
  return recognitionCoordinator.state(workplaceId);
}

export function markRecognitionRefreshNeeded(workplaceId: WorkplaceId): void {
  const slot = recognitionCoordinator.slot(workplaceId);
  slot.generation += 1;
  preferences.workplace.update(workplaceId, { accountMatcherRefreshPending: true });
  recognitionCoordinator.state(workplaceId).next('updating');
}

/** Keep recognition invalidated until all overlapping changes have committed or failed. */
export async function withRecognitionRefreshWhen<T>(
  workplaceId: WorkplaceId,
  mutation: (invalidate: () => void) => Promise<T>,
): Promise<T> {
  const slot = recognitionCoordinator.slot(workplaceId);
  let invalidated = false;
  const invalidate = () => {
    if (invalidated) return;
    slot.activeMutations += 1;
    invalidated = true;
    markRecognitionRefreshNeeded(workplaceId);
  };
  try {
    return await mutation(invalidate);
  } finally {
    if (invalidated) {
      slot.activeMutations -= 1;
      if (slot.activeMutations === 0) {
        await refreshSmsRecognitionBestEffort(workplaceId);
      }
    }
  }
}

export function withRecognitionRefresh<T>(
  workplaceId: WorkplaceId,
  mutation: () => Promise<T>,
): Promise<T> {
  return withRecognitionRefreshWhen(workplaceId, invalidate => {
    invalidate();
    return mutation();
  });
}

/** Stored parse fields for hint projection. Refresh does not re-parse the message. */
function storedSmsForRecognition(record: InboxRecordSnapshot): {
  message: SmsMessage;
  parsed: ParsedTransaction;
} {
  const message: SmsMessage = {
    id: record.deviceSourceId,
    address: record.senderAddress ?? '',
    body: record.rawBody ?? '',
    date: record.inputDate,
  };
  return {
    message,
    parsed: {
      id: message.id,
      amount: record.parsedAmount,
      merchant: record.parsedMerchant,
      type:
        record.direction === TransactionDirection.DEBIT
          ? 'debit'
          : record.direction === TransactionDirection.CREDIT
            ? 'credit'
            : 'unknown',
      date: record.inputDate,
      rawBody: message.body,
      address: message.address,
      accountSource: record.parsedAccountSource,
      referenceNumber: record.referenceNumber,
      currencyCode: record.parsedCurrencyCode,
      confidence: record.parseConfidence ?? 0,
      parseStatus: record.parseStatus,
      parseReason: record.parseReason ?? '',
    },
  };
}

/** Re-evaluates pending review state only; it never changes disposition or accounting data. */
export async function refreshSmsRecognition(
  workplaceId: WorkplaceId,
  batchSize = BATCH_SIZE,
): Promise<number> {
  const slot = recognitionCoordinator.slot(workplaceId);
  if (slot.activeMutations > 0) return 0;
  slot.generation += 1;
  const generation = slot.generation;
  const isCurrent = () => slot.generation === generation;
  preferences.workplace.update(workplaceId, { accountMatcherRefreshPending: true });
  recognitionCoordinator.state(workplaceId).next('updating');
  let total = 0;
  try {
    let cursor: string | undefined;
    while (true) {
      if (!isCurrent()) return total;
      const result = await runAccountingWriteSession(async session => {
        if (!isCurrent()) return null;
        // Context, page, projection, and staged updates share the database's one writer.
        const [context, page] = await Promise.all([
          loadSmsDecisionContext(workplaceId),
          transactionInboxRepository.findPendingSmsPage(workplaceId, cursor, batchSize),
        ]);
        if (!isCurrent()) return null;
        const updates = page.records.flatMap(record => {
          if (record.parseStatus !== InboxParseStatus.PARSED || !record.deviceInboxId) return [];
          const { message, parsed } = storedSmsForRecognition(record);
          const projection = projectRecognition(message, parsed, context);
          // Ignore rules have no new suggestions; preserve existing hints.
          const suggestions = projection.suggestedAccounts ?? {
            sourceAccountId: record.suggestedSourceAccountId,
            categoryAccountId: record.suggestedCategoryAccountId,
          };
          return [
            {
              deviceInboxId: record.deviceInboxId,
              recognition: projection.recognition,
              ...suggestions,
            },
          ];
        });
        await deviceSmsInboxRepository.stagePendingRecognitionUpdates(
          session,
          workplaceId,
          updates,
          isCurrent,
        );
        return { count: updates.length, nextCursor: page.nextCursor };
      });
      if (!isCurrent() || !result) return total;
      total += result.count;
      cursor = result.nextCursor;
      if (!cursor) break;
    }

    if (isCurrent()) {
      preferences.workplace.update(workplaceId, { accountMatcherRefreshPending: false });
      recognitionCoordinator.state(workplaceId).next('ready');
    }
    return total;
  } catch (error) {
    if (isCurrent()) recognitionCoordinator.state(workplaceId).next('failed');
    throw error;
  }
}

export async function refreshSmsRecognitionBestEffort(workplaceId: WorkplaceId): Promise<void> {
  try {
    await refreshSmsRecognition(workplaceId);
  } catch {
    // Matcher persistence has already succeeded; stale review hints can be refreshed next time.
    logger.warn('[SMS] Account recognition refresh failed');
  }
}
