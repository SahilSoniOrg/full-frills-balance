import {
  stageJournalCaptureMetadataWrite,
  type AccountingWriteSession,
} from '@/src/data/repositories/AccountingWriteSession';
import Journal from '@/src/data/models/Journal';
import JournalMetadata from '@/src/data/models/JournalMetadata';
import Transaction from '@/src/data/models/Transaction';
import { journalTables } from '@/src/data/repositories/journal/journalPersistenceSupport';
import type {
  PutJournalRequest,
  ValidatedJournal,
} from '@/src/data/repositories/journal/journalPersistenceTypes';
import type { JournalWriteLine, JournalWriteMetadata } from '@/src/types/journalWrite';
import { JournalStatus } from '@/src/types/enums';
import { JournalId, WorkplaceId } from '@/src/types/ids';
import type { AuditEventMetadata } from '@/src/types/auditEvents';
import { hashSmsMetadataFingerprints } from '@/src/domain/transaction-intelligence/smsPrivateMetadata';
import { applyJournalMetadataProjections } from '@/src/data/repositories/journal/journalMetadataProjections';
import {
  mergeCaptureMetadataJson,
  readCaptureMetadata,
  withCaptureMetadata,
  type CaptureCategoryLine,
} from '@/src/domain/transaction-intelligence/captureMetadata';
import { transitionCapture } from '@/src/domain/transaction-intelligence/captureTransition';
import { Q } from '@nozbe/watermelondb';

function assignMetadata(record: JournalMetadata, metadata: JournalWriteMetadata, now: Date): void {
  record.importSource = metadata.importSource;
  record.originalSmsId = metadata.originalSmsId;
  if ('originalSmsSender' in metadata) record.originalSmsSender = metadata.originalSmsSender;
  if ('originalSmsBody' in metadata) record.originalSmsBody = metadata.originalSmsBody;
  record.metadataJson = hashSmsMetadataFingerprints(metadata.metadataJson);
  applyJournalMetadataProjections(record);
  record.updatedAt = now;
}

/** Loads the journal's current metadata row, preferring the capture-bearing row when present. */
async function findExistingMetadata(
  journalId: JournalId,
  workplaceId: WorkplaceId,
): Promise<JournalMetadata | null> {
  const rows = await journalTables.metadata
    .query(Q.where('journal_id', journalId), Q.where('workplace_id', workplaceId))
    .fetch();
  return rows.find(row => readCaptureMetadata(row.metadataJson)) ?? rows[0] ?? null;
}

export interface StagePutCaptureMetadataArgs {
  session: AccountingWriteSession;
  workplaceId: WorkplaceId;
  journalId: JournalId;
  existing: Journal | null;
  oldTransactions: readonly Transaction[];
  replacesLines: boolean;
  input: PutJournalRequest;
  balance: ValidatedJournal;
  status: JournalStatus;
  auditMetadata?: AuditEventMetadata;
  now: Date;
}

/**
 * Merges requested metadata with the persisted row, normalizes capture categories against the
 * validated account types, and stages the resulting metadata write in the caller's session.
 */
export async function stagePutCaptureMetadata({
  session,
  workplaceId,
  journalId,
  existing,
  oldTransactions,
  replacesLines,
  input,
  balance,
  status,
  auditMetadata,
  now,
}: StagePutCaptureMetadataArgs): Promise<void> {
  const existingMetadata = existing ? await findExistingMetadata(existing.id, workplaceId) : null;
  const existingCapture = readCaptureMetadata(existingMetadata?.metadataJson);
  let metadata: JournalWriteMetadata | undefined = input.metadata
    ? {
        ...input.metadata,
        importSource:
          existingCapture && existingMetadata
            ? existingMetadata.importSource
            : input.metadata.importSource,
        originalSmsId: input.metadata.originalSmsId ?? existingMetadata?.originalSmsId,
        metadataJson: mergeCaptureMetadataJson(
          existingMetadata?.metadataJson,
          input.metadata.metadataJson,
        ),
      }
    : undefined;
  const newCapture = !existing ? readCaptureMetadata(metadata?.metadataJson) : null;
  const captureLines = (values: readonly JournalWriteLine[]): CaptureCategoryLine[] =>
    values.map(line => ({
      ...line,
      accountType: balance.accountsById.get(line.accountId)!.accountType,
      currencyCode: balance.accountsById.get(line.accountId)!.currencyCode,
    }));
  if (newCapture && metadata) {
    // Source UI hints are normalized against persisted account types and rounded lines.
    const transition = transitionCapture({
      existing: newCapture,
      proposedLines: captureLines(balance.lines),
      actor: auditMetadata?.source === 'system' ? 'system' : 'user',
      now: now.getTime(),
    });
    if (!transition.ok || !transition.capture)
      throw new Error('The captured category information could not be prepared.');
    metadata = {
      ...metadata,
      metadataJson: withCaptureMetadata(metadata.metadataJson, transition.capture),
    };
  }
  if (replacesLines || input.confirmCaptureKey) {
    const transition = transitionCapture({
      existing: existingCapture,
      proposedLines: captureLines(balance.lines),
      actor: auditMetadata?.source === 'system' ? 'system' : 'user',
      now: now.getTime(),
      ...(input.confirmCaptureKey
        ? {
            confirmation: {
              key: input.confirmCaptureKey,
              originalLines: oldTransactions,
              posted: auditMetadata?.source === 'app' && status === JournalStatus.POSTED,
            },
          }
        : {}),
    });
    if (!transition.ok) {
      throw new Error(
        transition.rejection === 'missing_capture'
          ? 'This entry has no captured categories to confirm.'
          : 'The categories changed. Review this entry again.',
      );
    }
    if (transition.capture && existingCapture && existingMetadata) {
      metadata = {
        importSource: existingMetadata.importSource,
        originalSmsId: existingMetadata.originalSmsId,
        ...metadata,
        metadataJson: withCaptureMetadata(
          metadata?.metadataJson ?? existingMetadata.metadataJson,
          transition.capture,
        ),
      };
    }
  }
  if (!metadata) return;

  const metadataWriterKey = existingMetadata?.id ?? 'create-metadata';
  stageJournalCaptureMetadataWrite(
    session,
    workplaceId,
    journalId,
    metadataWriterKey,
    metadata.metadataJson,
    metadataJson => {
      const linkedMetadata = {
        ...metadata,
        metadataJson,
      };
      return [
        existingMetadata
          ? existingMetadata.prepareUpdate(record => assignMetadata(record, linkedMetadata, now))
          : journalTables.metadata.prepareCreate(record => {
              record.journalId = journalId;
              record.workplaceId = workplaceId;
              record.createdAt = now;
              assignMetadata(record, linkedMetadata, now);
            }),
      ];
    },
  );
}
