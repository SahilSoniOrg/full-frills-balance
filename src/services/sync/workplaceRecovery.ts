import { importRepository } from '@/src/data/repositories/ImportRepository';
import { localKeyHierarchy } from '@/src/services/backup/localKeyHierarchy';
import { parseRecoveryCredential } from '@/src/services/backup/keyEnvelopes';
import type { KeyAccessIdentity } from '@/src/services/backup/keyHierarchyRecords';
import {
  assertKeyAccessAllowed,
  subscribeKeyAccessPolicy,
} from '@/src/services/backup/keyAccessPolicy';
import type { RestoreCompletionState } from '@/src/services/backup/restoreCompletionState';
import { KeyOperationError } from '@/src/utils/keyOperationError';
import { countAccountsVsCategories } from '@/src/utils/accountCategory';
import { asWorkplaceId } from '@/src/types/ids';
import { readVerifiedBackup, decryptVerifiedBackup } from './verifiedBackup';
import { rowImportData } from './workplaceRowValidation';
import { copyRecoveredWorkplaceRows, workplaceRecoveryDestination } from './workplaceRecoveryCopy';
import type { RestoreBackupPreview, RestoreBackupResult } from './restoreBackup';

export type PreparedWorkplaceRecovery = Awaited<ReturnType<typeof prepareWorkplaceRecovery>>;

/** Memory-only preparation. Requires no User/Device identity and installs no source keys. */
export async function prepareWorkplaceRecovery(
  archive: Uint8Array,
  value: unknown,
  signal?: AbortSignal,
) {
  const cancellation = new AbortController();
  const unsubscribe = subscribeKeyAccessPolicy(allowed => {
    if (!allowed) cancellation.abort();
  });
  const active = () => {
    assertKeyAccessAllowed();
    if (signal?.aborted || cancellation.signal.aborted)
      throw new KeyOperationError('FFB_KEY_CANCELLED');
  };
  try {
    active();
    const credential = parseRecoveryCredential(value);
    if (credential.purpose !== 'workplace-dump')
      throw new Error('Choose the Workplace recovery file, not the User recovery file');
    const verified = await readVerifiedBackup(archive);
    active();
    const decoded = await decryptVerifiedBackup(
      verified,
      envelopes =>
        localKeyHierarchy.decryptWorkplaceRecoveryRows(
          verified.backup.workplaceKeys,
          credential,
          envelopes,
        ),
      active,
    );
    const data = rowImportData(decoded.rows);
    const preview: RestoreBackupPreview = {
      recoveryCopy: true,
      capturedAt: verified.verifiedManifest.fields.createdAt,
      workplace: {
        id: verified.backup.workplaceKeys.workplaceId,
        name: decoded.metadata.name,
        currency: decoded.metadata.defaultCurrencyCode,
      },
      ...countAccountsVsCategories(data.accounts),
      journals: data.journals.length,
      transactions: data.transactions.length,
      budgets: data.budgets?.length ?? 0,
      plannedPayments: data.plannedPayments?.length ?? 0,
    };
    active();
    return { ...decoded, preview };
  } finally {
    unsubscribe();
  }
}

/** Called only after preview acceptance and destination recovery-file verification. */
export async function publishWorkplaceRecovery(
  prepared: PreparedWorkplaceRecovery,
  identity: KeyAccessIdentity,
  signal?: AbortSignal,
): Promise<RestoreBackupResult> {
  const cancellation = new AbortController();
  const unsubscribe = subscribeKeyAccessPolicy(allowed => {
    if (!allowed) cancellation.abort();
  });
  const abort = () => cancellation.abort();
  signal?.addEventListener('abort', abort, { once: true });
  const active = () => {
    assertKeyAccessAllowed();
    if (signal?.aborted || cancellation.signal.aborted)
      throw new KeyOperationError('FFB_KEY_CANCELLED');
  };
  try {
    active();
    const destination = await workplaceRecoveryDestination(prepared.manifestHash, identity);
    const keys = await localKeyHierarchy.exportWorkplaceKeys(identity, destination.workplaceId);
    if (!keys.recoveryConfirmed)
      throw new Error('Save and verify the new Workplace recovery file first');
    await localKeyHierarchy.preflightWorkplaceRestore(identity, keys);
    active();
    const rows = await copyRecoveredWorkplaceRows(
      prepared.rows,
      asWorkplaceId(prepared.preview.workplace.id),
      destination,
    );
    active();
    const completion: RestoreCompletionState = {
      formatVersion: 1,
      identity,
      workplaceKeys: keys,
      manifestHash: destination.receipt,
      rowCount: rows.length,
      safeToSpendDays: prepared.metadata.safeToSpendDays,
      recoveredCopy: true,
    };
    const workplace = await importRepository.batchInsertRowRestore(
      {
        id: destination.workplaceId,
        name: `${prepared.metadata.name} (recovered)`,
        icon: prepared.metadata.icon,
        defaultCurrencyCode: prepared.metadata.defaultCurrencyCode,
        rowRestoreCompletionJson: JSON.stringify(completion),
      },
      rowImportData(rows),
      destination.receipt,
      cancellation.signal,
    );
    return {
      status: workplace.rowRestoreCompletionJson ? 'completion-pending' : 'ready',
      identity,
      workplace,
      manifestHash: destination.receipt,
      rowCount: rows.length,
      warnings: [],
    };
  } finally {
    unsubscribe();
    signal?.removeEventListener('abort', abort);
  }
}
