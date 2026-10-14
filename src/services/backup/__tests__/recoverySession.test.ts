import { completeWorkplaceRecovery, resolveRecoverySession } from '../recoverySession';
import type { EncryptionSetupSession } from '../encryptionSetupStore';

const userPin = `sha256:${'11'.repeat(32)}`;
const keyA = `sha256:${'22'.repeat(32)}`;
const keyB = `sha256:${'33'.repeat(32)}`;
const credential = { identityId: 'user', identityKeyId: userPin };
const existing = {
  user: 'ready' as const,
  identity: { userId: 'user', registeredDeviceId: 'phone', userKeyFingerprint: userPin },
};
function session(): EncryptionSetupSession {
  return {
    formatVersion: 1,
    intent: 'recover-user',
    userId: 'user',
    deviceId: 'phone',
    userKeyFingerprint: userPin,
    verifiedWorkplaces: [{ workplaceId: 'B', keyId: keyB }],
    pendingRecoveries: [{ workplaceId: 'B', keyId: keyB, preserveExistingBooks: false }],
  };
}

it('a ready User or a different verified Workplace never grants preservation for A', () => {
  const saved = session();
  const original = JSON.stringify(saved);
  const plan = resolveRecoverySession({
    session: saved,
    existing,
    credential,
    workplaceKeys: { workplaceId: 'A', keyId: keyA },
    deviceId: 'phone',
  });
  expect(plan.preserveExistingBooks).toBe(false);
  expect(plan.session.pendingRecoveries).toEqual([
    ...saved.pendingRecoveries!,
    { workplaceId: 'A', keyId: keyA, preserveExistingBooks: false },
  ]);
  expect(JSON.stringify(saved)).toBe(original);
});

it.each([true, false])(
  'a verified A binding respects its pending preservation decision %s',
  preserveExistingBooks => {
    const saved = session();
    saved.verifiedWorkplaces!.push({ workplaceId: 'A', keyId: keyA });
    saved.pendingRecoveries!.push({ workplaceId: 'A', keyId: keyA, preserveExistingBooks });
    const plan = resolveRecoverySession({
      session: saved,
      existing,
      credential,
      workplaceKeys: { workplaceId: 'A', keyId: keyA },
      deviceId: 'phone',
    });
    expect(plan.preserveExistingBooks).toBe(preserveExistingBooks);
  },
);

it('clears only completed A progress without mutating the prior checkpoint or granting other bindings', () => {
  const saved = session();
  saved.pendingRecoveries!.push({ workplaceId: 'A', keyId: keyA, preserveExistingBooks: false });
  const original = JSON.stringify(saved);
  const next = completeWorkplaceRecovery(saved, 'A', keyA);
  expect(next.pendingRecoveries).toEqual([
    { workplaceId: 'B', keyId: keyB, preserveExistingBooks: false },
  ]);
  expect(next.verifiedWorkplaces).toEqual([
    { workplaceId: 'B', keyId: keyB },
    { workplaceId: 'A', keyId: keyA },
  ]);
  expect(JSON.stringify(saved)).toBe(original);
});

it.each([true, false])(
  'retains a prior package only when its export was confirmed: %s',
  confirmed => {
    const saved = session();
    const reference = { id: 'aa'.repeat(16), workplaceId: 'B', fingerprint: keyB, confirmed };
    saved.package = reference;
    const plan = resolveRecoverySession({
      session: saved,
      existing,
      credential,
      workplaceKeys: { workplaceId: 'A', keyId: keyA },
      deviceId: 'phone',
    });
    expect(plan.session.package).toEqual(confirmed ? reference : undefined);
    expect(saved.package).toBe(reference);
  },
);
