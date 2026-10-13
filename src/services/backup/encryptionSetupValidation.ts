import type { EncryptionSetupSession } from './encryptionSetupStore';

export function parseEncryptionSetupSession(value: unknown): EncryptionSetupSession {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error('Invalid encryption setup state');
  const raw = value as Record<string, unknown>;
  if (
    Object.keys(raw).some(
      key =>
        ![
          'formatVersion',
          'intent',
          'userId',
          'deviceId',
          'userKeyFingerprint',
          'package',
          'pendingRecoveries',
        ].includes(key),
    ) ||
    raw.formatVersion !== 1 ||
    !['create-user', 'recover-user'].includes(String(raw.intent)) ||
    typeof raw.userId !== 'string' ||
    !raw.userId ||
    typeof raw.deviceId !== 'string' ||
    !raw.deviceId ||
    (raw.userKeyFingerprint !== undefined &&
      (typeof raw.userKeyFingerprint !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(raw.userKeyFingerprint)))
  )
    throw new Error('Invalid encryption setup identity');
  if (raw.pendingRecoveries !== undefined) {
    if (!Array.isArray(raw.pendingRecoveries)) throw new Error('Invalid recovery progress');
    const workplaces = new Set<string>();
    for (const value of raw.pendingRecoveries) {
      if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Invalid recovery progress');
      const record = value as Record<string, unknown>;
      if (
        Object.keys(record).sort().join(',') !== 'keyId,preserveExistingBooks,workplaceId' ||
        typeof record.workplaceId !== 'string' ||
        !record.workplaceId ||
        workplaces.has(record.workplaceId) ||
        typeof record.keyId !== 'string' ||
        !/^sha256:[a-f0-9]{64}$/.test(record.keyId) ||
        typeof record.preserveExistingBooks !== 'boolean'
      )
        throw new Error('Invalid recovery progress');
      workplaces.add(record.workplaceId);
    }
  }
  if (raw.package !== undefined) {
    if (!raw.package || typeof raw.package !== 'object' || Array.isArray(raw.package))
      throw new Error('Invalid package reference');
    const record = raw.package as Record<string, unknown>;
    if (
      Object.keys(record).sort().join(',') !== 'confirmed,fingerprint,id,workplaceId' ||
      typeof record.id !== 'string' ||
      !/^[a-f0-9]{32}$/.test(record.id) ||
      typeof record.workplaceId !== 'string' ||
      !record.workplaceId ||
      typeof record.confirmed !== 'boolean' ||
      typeof record.fingerprint !== 'string' ||
      !/^sha256:[a-f0-9]{64}$/.test(record.fingerprint)
    )
      throw new Error('Invalid package reference');
  }
  return value as EncryptionSetupSession;
}
