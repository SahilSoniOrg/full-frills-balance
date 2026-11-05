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

import { projectRecognition } from './pipeline/smsDecision';
import { loadSmsDecisionContext } from './pipeline/smsDecisionContext';

const BATCH_SIZE = 200;

export type RecognitionRefreshState = 'ready' | 'updating' | 'failed';

/**
 * Serializes recognition writes for one workplace.
 * The serial advances on every acquisition and every idle fence, so a refresh can
 * tell that a scan committed after it loaded context.
 */
class RecognitionLock {
  lockSerial = 0;
  private reserved = 0;
  private chain: Promise<void> = Promise.resolve();

  /** Watermark an idle lock. Returns null when a scan or refresh write is queued. */
  claimIdleFence(): number | null {
    if (this.reserved > 0) return null;
    this.lockSerial += 1;
    return this.lockSerial;
  }

  run<T>(task: (serial: number) => Promise<T>): Promise<T> {
    this.reserved += 1;
    const execute = this.chain.then(async () => {
      this.lockSerial += 1;
      const serial = this.lockSerial;
      try {
        return await task(serial);
      } finally {
        this.reserved -= 1;
      }
    });
    this.chain = execute.then(
      () => undefined,
      () => undefined,
    );
    return execute;
  }
}

type WorkplaceRecognition = {
  generation: number;
  activeMutations: number;
  lock: RecognitionLock;
  state?: BehaviorSubject<RecognitionRefreshState>;
};

/** Generation, overlapping matcher edits, publish state, and the recognition-write lock. */
class RecognitionCoordinator {
  private readonly workplaces = new Map<WorkplaceId, WorkplaceRecognition>();

  private ensure(workplaceId: WorkplaceId): WorkplaceRecognition {
    let slot = this.workplaces.get(workplaceId);
    if (!slot) {
      slot = {
        generation: 0,
        activeMutations: 0,
        lock: new RecognitionLock(),
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

  claimIdleFence(workplaceId: WorkplaceId): number | null {
    return this.ensure(workplaceId).lock.claimIdleFence();
  }

  async waitForIdleFence(workplaceId: WorkplaceId): Promise<number> {
    const lock = this.ensure(workplaceId).lock;
    await lock.run(async () => undefined);
    const serial = lock.claimIdleFence();
    if (serial === null) return this.waitForIdleFence(workplaceId);
    return serial;
  }

  exclusive<T>(workplaceId: WorkplaceId, task: (serial: number) => Promise<T>): Promise<T> {
    return this.ensure(workplaceId).lock.run(task);
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

/**
 * Holds the workplace recognition lock around a scan's recognition write.
 * Does not start a full-inbox refresh; only an interrupted refresh does that.
 */
export function withRecognitionWrite<T>(
  workplaceId: WorkplaceId,
  write: () => Promise<T>,
): Promise<T> {
  return recognitionCoordinator.exclusive(workplaceId, () => write());
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
  const resumeIfInterrupted = async (): Promise<number> => {
    if (isCurrent()) await refreshSmsRecognitionBestEffort(workplaceId);
    return total;
  };
  try {
    // Fence an idle lock, then load. The load does not hold the lock, so a scan can
    // commit; a serial change afterwards means this context is already stale.
    const serialAtLoad =
      recognitionCoordinator.claimIdleFence(workplaceId) ??
      (await recognitionCoordinator.waitForIdleFence(workplaceId));
    const context = await loadSmsDecisionContext(workplaceId);
    if (!isCurrent()) return total;
    if (slot.lock.lockSerial !== serialAtLoad) return resumeIfInterrupted();

    let cursor: string | undefined;
    let expectedSerial = serialAtLoad;
    do {
      if (!isCurrent()) return total;
      if (slot.lock.lockSerial !== expectedSerial) return resumeIfInterrupted();
      const page = await transactionInboxRepository.findPendingSmsPage(
        workplaceId,
        cursor,
        batchSize,
      );
      cursor = page.nextCursor;
      const updates = page.records.flatMap(record => {
        if (record.parseStatus !== InboxParseStatus.PARSED) return [];
        // Recognition is stored on the device inbox row, so a record without
        // deviceInboxId cannot be updated.
        if (!record.deviceInboxId) return [];
        const { message, parsed } = storedSmsForRecognition(record);
        const projection = projectRecognition(message, parsed, context);
        // An ignore rule suggests nothing. Keep stored hints; refresh does not change disposition.
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
      if (!isCurrent()) return total;
      // Re-check under the lock; the inbox writer repeats the guard before its batch.
      const writeSerial = await recognitionCoordinator.exclusive(workplaceId, async serial => {
        if (!isCurrent() || serial !== expectedSerial + 1) return null;
        return serial;
      });
      if (!isCurrent()) return total;
      if (writeSerial === null) return resumeIfInterrupted();
      // Checked again inside the inbox write so a scan that committed after this
      // lock check can still reject the pre-scan batch.
      let guard: boolean | undefined;
      await deviceSmsInboxRepository.updatePendingRecognition(workplaceId, updates, () => {
        guard = slot.generation === generation && slot.lock.lockSerial === writeSerial;
        return guard;
      });
      if (!isCurrent()) return total;
      if (guard === false) return resumeIfInterrupted();
      total += updates.length;
      // A scan that waited for this write runs before we continue. Later pages would
      // still be the pre-scan projection, so reload. The last page already committed
      // before that scan, and the scan does not start another full refresh.
      if (slot.lock.lockSerial !== writeSerial) {
        if (cursor) return resumeIfInterrupted();
        break;
      }
      expectedSerial = writeSerial;
    } while (cursor);

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
