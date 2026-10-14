import {
  parseObject,
  assertAllowedKeys,
  assertExactKeys,
  isSha256Id,
  isHexId,
} from '@/src/utils/strictObject';
import type { EncryptionSetupSession } from './encryptionSetupStore';

export function parseEncryptionSetupSession(value: unknown): EncryptionSetupSession {
  const raw = parseObject(value, 'Invalid encryption setup state');
  assertAllowedKeys(
    raw,
    [
      'formatVersion',
      'intent',
      'userId',
      'deviceId',
      'userKeyFingerprint',
      'package',
      'verifiedWorkplaces',
      'pendingRecoveries',
    ],
    'Invalid encryption setup identity',
  );
  if (
    raw.formatVersion !== 1 ||
    !['create-user', 'recover-user'].includes(String(raw.intent)) ||
    typeof raw.userId !== 'string' ||
    !raw.userId ||
    typeof raw.deviceId !== 'string' ||
    !raw.deviceId ||
    (raw.userKeyFingerprint !== undefined && !isSha256Id(raw.userKeyFingerprint))
  )
    throw new Error('Invalid encryption setup identity');
  if (raw.verifiedWorkplaces !== undefined) {
    if (!Array.isArray(raw.verifiedWorkplaces) || !raw.userKeyFingerprint)
      throw new Error('Invalid Workplace binding');
    const workplaces = new Set<string>();
    for (const value of raw.verifiedWorkplaces) {
      const binding = parseObject(value, 'Invalid Workplace binding');
      assertExactKeys(binding, ['keyId', 'workplaceId'], 'Invalid Workplace binding');
      if (
        typeof binding.workplaceId !== 'string' ||
        !binding.workplaceId ||
        workplaces.has(binding.workplaceId) ||
        !isSha256Id(binding.keyId)
      )
        throw new Error('Invalid Workplace binding');
      workplaces.add(binding.workplaceId);
    }
  }
  if (raw.pendingRecoveries !== undefined) {
    if (!Array.isArray(raw.pendingRecoveries)) throw new Error('Invalid recovery progress');
    const workplaces = new Set<string>();
    for (const value of raw.pendingRecoveries) {
      const record = parseObject(value, 'Invalid recovery progress');
      assertExactKeys(
        record,
        ['keyId', 'preserveExistingBooks', 'workplaceId'],
        'Invalid recovery progress',
      );
      if (
        typeof record.workplaceId !== 'string' ||
        !record.workplaceId ||
        workplaces.has(record.workplaceId) ||
        !isSha256Id(record.keyId) ||
        typeof record.preserveExistingBooks !== 'boolean'
      )
        throw new Error('Invalid recovery progress');
      workplaces.add(record.workplaceId);
    }
  }
  if (raw.package !== undefined) {
    const record = parseObject(raw.package, 'Invalid package reference');
    assertExactKeys(
      record,
      ['confirmed', 'fingerprint', 'id', 'workplaceId'],
      'Invalid package reference',
    );
    if (
      !isHexId(record.id, 32) ||
      typeof record.workplaceId !== 'string' ||
      !record.workplaceId ||
      typeof record.confirmed !== 'boolean' ||
      !isSha256Id(record.fingerprint)
    )
      throw new Error('Invalid package reference');
  }
  return value as EncryptionSetupSession;
}
