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
      'enrolledWorkplaces',
      'pendingCompletion',
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
  if (raw.pendingCompletion !== undefined) {
    const completion = parseObject(raw.pendingCompletion, 'Invalid recovery completion');
    assertAllowedKeys(
      completion,
      ['id', 'publication', 'snapshotFingerprint', 'setupDraftFingerprint'],
      'Invalid recovery completion',
    );
    if (
      !isHexId(completion.id, 32) ||
      !isSha256Id(completion.snapshotFingerprint) ||
      (completion.setupDraftFingerprint !== undefined &&
        !isSha256Id(completion.setupDraftFingerprint))
    )
      throw new Error('Invalid recovery completion');
    const publication = parseObject(completion.publication, 'Invalid recovery completion');
    assertExactKeys(
      publication,
      publication.kind === 'restored'
        ? ['kind', 'workplaceId', 'bookPreferences']
        : ['kind', 'workplaceId'],
      'Invalid recovery completion',
    );
    if (
      !['restored', 'keys-recovered'].includes(String(publication.kind)) ||
      typeof publication.workplaceId !== 'string' ||
      !publication.workplaceId
    )
      throw new Error('Invalid recovery completion');
    if (publication.kind === 'restored') {
      const prefs = parseObject(publication.bookPreferences, 'Invalid recovered preferences');
      assertExactKeys(prefs, ['safeToSpendDays'], 'Invalid recovered preferences');
      if (
        ![30, 60, 90].includes(Number(prefs.safeToSpendDays)) ||
        typeof prefs.safeToSpendDays !== 'number'
      )
        throw new Error('Invalid recovered preferences');
    }
  }
  if (raw.verifiedWorkplaces !== undefined) {
    if (!Array.isArray(raw.verifiedWorkplaces) || !raw.userKeyFingerprint)
      throw new Error('Invalid Workplace binding');
    const workplaces = new Set<string>();
    for (const value of raw.verifiedWorkplaces) {
      const binding = parseObject(value, 'Invalid Workplace binding');
      assertAllowedKeys(
        binding,
        ['keyId', 'workplaceId', 'savedPackageFingerprint'],
        'Invalid Workplace binding',
      );
      if (
        binding.savedPackageFingerprint !== undefined &&
        !isSha256Id(binding.savedPackageFingerprint)
      )
        throw new Error('Invalid saved backup fingerprint');
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
