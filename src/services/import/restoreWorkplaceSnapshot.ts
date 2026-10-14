import { KeyOperationError, assertKeyOperationActive } from '@/src/utils/keyOperationError';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { asWorkplaceId } from '@/src/types/ids';
import {
  decodeWorkplaceSnapshot,
  serializeWorkplaceSnapshot,
  workplaceSnapshotFingerprint,
  type WorkplaceSnapshot,
} from '@/src/services/backup/workplaceSnapshot';
import { currencyReadService } from '@/src/services/currency-read-service';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';

/**
 * Publishes an identity-preserving snapshot, without activation, enrollment, or User/Device settings.
 * Book preferences are a handoff for the eventual setup finisher, not an independent MMKV write here.
 */
export async function restoreWorkplaceSnapshot(
  source: WorkplaceSnapshot,
  signal?: AbortSignal,
): Promise<{
  workplaceId: ReturnType<typeof asWorkplaceId>;
  bookPreferences: WorkplaceSnapshot['bookPreferences'];
}> {
  assertKeyOperationActive(signal);
  const serialized = serializeWorkplaceSnapshot(source);
  const snapshot = decodeWorkplaceSnapshot(serialized);
  const fingerprint = await workplaceSnapshotFingerprint(snapshot);
  const workplaceId = asWorkplaceId(snapshot.workplace.id);
  for (const [code, precision] of Object.entries(snapshot.currencyPrecisions)) {
    if ((await currencyReadService.getPrecision(code)) !== precision) {
      throw new Error(
        `Snapshot currency precision differs for ${code}; local books will not be reinterpreted`,
      );
    }
  }
  await importRepository.batchInsertSnapshotRestore(
    { ...snapshot.workplace, id: workplaceId },
    snapshot.data,
    fingerprint,
    signal,
  );
  return { workplaceId, bookPreferences: snapshot.bookPreferences };
}

export type WorkplaceRecoveryResult =
  | { kind: 'keys-recovered'; workplaceId: ReturnType<typeof asWorkplaceId> }
  | ({ kind: 'restored' } & Awaited<ReturnType<typeof restoreWorkplaceSnapshot>>);

export async function assertWorkplaceRecoveryTarget(
  workplaceId: string,
  preserveExistingBooks: boolean,
): Promise<void> {
  const existing = await workplaceRepository.find(asWorkplaceId(workplaceId));
  // A committed restore receipt is checked against the decrypted snapshot by
  // ordinary publication. Unbound books without a receipt cannot be a retry.
  if (existing && !preserveExistingBooks && !existing.snapshotRestoreFingerprint)
    throw new KeyOperationError(
      'FFB_KEY_WORKPLACE_COLLISION',
      'Snapshot Workplace already exists; restore will not overwrite local books. Export your current local books first, then recover on another Device or a fresh installation using your saved recovery files.',
    );
}

/** Only the recovery caller with a matching pre-existing local key binding may retain books. */
export async function recoverWorkplaceSnapshot(
  source: WorkplaceSnapshot,
  options: { preserveExistingBooks: boolean; signal?: AbortSignal },
): Promise<WorkplaceRecoveryResult> {
  assertKeyOperationActive(options.signal);
  const workplaceId = asWorkplaceId(source.workplace.id);
  if (options.preserveExistingBooks && (await workplaceRepository.find(workplaceId)))
    return { kind: 'keys-recovered', workplaceId };
  return { kind: 'restored', ...(await restoreWorkplaceSnapshot(source, options.signal)) };
}
