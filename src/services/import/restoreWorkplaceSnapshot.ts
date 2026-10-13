import { importRepository } from '@/src/data/repositories/ImportRepository';
import { asWorkplaceId } from '@/src/types/ids';
import {
  decodeWorkplaceSnapshot,
  serializeWorkplaceSnapshot,
  type WorkplaceSnapshot,
} from '@/src/services/backup/workplaceSnapshot';
import { snapshotFingerprint } from '@/src/services/backup/encryptedSnapshot';
import { currencyReadService } from '@/src/services/currency-read-service';

/**
 * Publishes an identity-preserving snapshot, without activation, enrollment, or User/Device settings.
 * Book preferences are a handoff for the eventual setup finisher, not an independent MMKV write here.
 */
export async function restoreWorkplaceSnapshot(source: WorkplaceSnapshot): Promise<{
  workplaceId: ReturnType<typeof asWorkplaceId>;
  bookPreferences: WorkplaceSnapshot['bookPreferences'];
}> {
  const serialized = serializeWorkplaceSnapshot(source);
  const snapshot = decodeWorkplaceSnapshot(serialized);
  const fingerprint = await snapshotFingerprint(serialized);
  const workplaceId = asWorkplaceId(snapshot.workplace.id);
  for (const [code, precision] of Object.entries(snapshot.currencyPrecisions)) {
    if ((await currencyReadService.getPrecision(code)) !== precision) {
      throw new Error(
        `Snapshot currency precision differs for ${code}; local books will not be reinterpreted`,
      );
    }
  }
  await importRepository.batchInsertNewWorkplace(
    { ...snapshot.workplace, id: workplaceId },
    snapshot.data,
    undefined,
    { snapshotRestoreFingerprint: fingerprint },
  );
  return { workplaceId, bookPreferences: snapshot.bookPreferences };
}
