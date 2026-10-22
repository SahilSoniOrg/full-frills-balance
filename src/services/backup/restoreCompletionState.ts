import { parseObject, assertExactKeys } from '@/src/utils/strictObject';
import {
  parseWorkplaceKeys,
  type KeyAccessIdentity,
  type WorkplaceKeys,
} from './keyHierarchyRecords';

/** Only public identity, encrypted envelopes and restored settings. Never credentials or keys. */
export type RestoreCompletionState = Readonly<{
  formatVersion: 1;
  identity: KeyAccessIdentity;
  workplaceKeys: WorkplaceKeys;
  manifestHash: string;
  rowCount: number;
  safeToSpendDays: 30 | 60 | 90;
  recoveryDraftId?: string;
  recoveredCopy?: true;
}>;

export function parseRestoreCompletionState(
  json: string,
  workplaceId: string,
  manifestHash: string | null,
): RestoreCompletionState {
  const raw = parseObject(JSON.parse(json), 'Invalid restore completion');
  assertExactKeys(
    raw,
    [
      'formatVersion',
      'identity',
      'workplaceKeys',
      'manifestHash',
      'rowCount',
      'safeToSpendDays',
      ...(raw.recoveryDraftId === undefined ? [] : ['recoveryDraftId']),
      ...(raw.recoveredCopy === undefined ? [] : ['recoveredCopy']),
    ],
    'Unexpected restore completion field',
  );
  const identity = parseObject(raw.identity, 'Invalid restore identity');
  assertExactKeys(
    identity,
    ['userId', 'registeredDeviceId', 'userKeyFingerprint'],
    'Invalid restore identity',
  );
  const keys = parseWorkplaceKeys(raw.workplaceKeys);
  if (
    raw.formatVersion !== 1 ||
    typeof raw.manifestHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(raw.manifestHash) ||
    raw.manifestHash !== manifestHash ||
    !Number.isSafeInteger(raw.rowCount) ||
    (raw.rowCount as number) < 1 ||
    ![30, 60, 90].includes(raw.safeToSpendDays as number) ||
    typeof identity.registeredDeviceId !== 'string' ||
    !identity.registeredDeviceId ||
    identity.userId !== keys.userId ||
    identity.userKeyFingerprint !== keys.userKeyFingerprint ||
    keys.workplaceId !== workplaceId ||
    !keys.recoveryConfirmed ||
    (raw.recoveredCopy !== undefined && raw.recoveredCopy !== true) ||
    (raw.recoveryDraftId !== undefined &&
      (typeof raw.recoveryDraftId !== 'string' || !raw.recoveryDraftId))
  )
    throw new Error('Restore completion does not match its published receipt');
  return raw as RestoreCompletionState;
}
