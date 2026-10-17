import { parseObject, assertAllowedKeys, isSha256Id } from '@/src/utils/strictObject';
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
      'enrolledWorkplaces',
      'verifiedWorkplaces',
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
  if (
    raw.enrolledWorkplaces !== undefined &&
    (!Array.isArray(raw.enrolledWorkplaces) ||
      raw.enrolledWorkplaces.some(id => typeof id !== 'string' || !id) ||
      new Set(raw.enrolledWorkplaces).size !== raw.enrolledWorkplaces.length)
  )
    throw new Error('Invalid enrolled Workplaces');
  if (raw.verifiedWorkplaces !== undefined) {
    if (!Array.isArray(raw.verifiedWorkplaces) || !raw.userKeyFingerprint)
      throw new Error('Invalid Workplace binding');
    const workplaces = new Set<string>();
    for (const value of raw.verifiedWorkplaces) {
      const binding = parseObject(value, 'Invalid Workplace binding');
      assertAllowedKeys(binding, ['keyId', 'workplaceId'], 'Invalid Workplace binding');
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
  return value as EncryptionSetupSession;
}
