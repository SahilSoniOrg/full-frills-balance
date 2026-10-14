import { database } from '@/src/data/database/Database';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import {
  captureWorkplaceSnapshot,
  serializeWorkplaceSnapshot,
} from '@/src/services/backup/workplaceSnapshot';
import { nativeKeyOperations } from '@/src/services/backup/nativeKeyOperations';
import { keyCiphertextStateStore } from '@/src/services/backup/keyCiphertextStateStore';
import {
  identityScope,
  userScope,
  workplaceScope,
} from '@/src/services/backup/keyHierarchyRecords';
import { createWorkplaceDump, decryptWorkplaceDump } from '@/src/services/backup/workplaceDump';
import {
  createLocalRecoveryPackage,
  verifyLocalRecoveryPackage,
} from '@/src/services/backup/localRecoveryPackage';
import { mockDataSeederService } from '@/src/services/import/MockDataSeederService';
import { restoreWorkplaceSnapshot } from '@/src/services/import/restoreWorkplaceSnapshot';
import { generator } from '@/src/data/database/idGenerator';
import { assertE2eHarnessEnabled } from './e2eRuntimeGate';
import {
  DEMO,
  USER,
  SOURCE_DEVICE,
  keys,
  requireProof,
  expectRejection,
  dataFingerprint,
  expandDemoBooks,
} from './nativeRecoveryProofFixtures';
import { writeProofBundle, type ProofBundle } from './nativeRecoveryProofBundle';

export type RecoveryProofReport = Record<string, number | string | boolean>;

export async function prepareProofStage(
  action: 'prepare' | 'large',
  progress: (message: string) => void,
  start: number,
): Promise<RecoveryProofReport> {
  assertE2eHarnessEnabled();
  requireProof(
    (await workplaceRepository.findAll()).length === 0,
    'Creation proof requires a fresh simulator installation',
  );
  await keyCiphertextStateStore.remove(identityScope(USER));
  await nativeKeyOperations.removeKey({ kind: 'device', userId: USER, deviceId: SOURCE_DEVICE });
  await keyCiphertextStateStore.remove(userScope(USER, SOURCE_DEVICE));
  await keyCiphertextStateStore.remove(workplaceScope(USER, DEMO));
  const userCredential = await keys.beginUser(USER, SOURCE_DEVICE);
  const identity = await keys.confirmUserRecovery(USER, SOURCE_DEVICE, userCredential);
  const workplaceCredential = await keys.enrollWorkplace(identity, DEMO, 'local-upgrade');
  await keys.confirmWorkplaceRecovery(identity, DEMO, workplaceCredential);
  progress('Creating books with the development demo generator');
  await mockDataSeederService.seedMockData(undefined, { refreshExchangeRates: false });
  if (action === 'large') {
    progress('Adding 5,000 disposable journal entries');
    await expandDemoBooks(await captureWorkplaceSnapshot(DEMO), 5_000);
  }
  progress('Capturing a consistent snapshot');
  const captureStart = performance.now();
  const snapshot = await captureWorkplaceSnapshot(DEMO);
  const captureMs = performance.now() - captureStart;
  const plaintextBytes = new TextEncoder().encode(serializeWorkplaceSnapshot(snapshot)).byteLength;
  progress('Encrypting through the native Device → User → Workplace chain');
  const encryptionStart = performance.now();
  const envelope = await keys.encryptSnapshot(identity, DEMO, snapshot);
  const encryptMs = performance.now() - encryptionStart;
  const workplaceKeys = await keys.exportWorkplaceKeys(identity, DEMO);
  const signedPackage = await createLocalRecoveryPackage(keys, identity, DEMO, envelope);
  await verifyLocalRecoveryPackage(signedPackage, identity);
  await expectRejection(
    () => verifyLocalRecoveryPackage({ ...signedPackage, signature: '00'.repeat(64) }, identity),
    'Forged package signature',
  );
  const dump = createWorkplaceDump(workplaceKeys, envelope);
  const recoveryStart = performance.now();
  const recovered = await decryptWorkplaceDump(dump, workplaceCredential);
  const recoverMs = performance.now() - recoveryStart;
  requireProof(
    serializeWorkplaceSnapshot(recovered) === serializeWorkplaceSnapshot(snapshot),
    'Native dump decryption changed the snapshot',
  );
  await expectRejection(
    () => decryptWorkplaceDump(dump, { ...workplaceCredential, handle: '00'.repeat(32) }),
    'Wrong recovery phrase',
  );
  await expectRejection(
    () => keys.decryptSnapshot(identity, DEMO, { ...envelope, workplaceId: 'other-books' }),
    'Altered routing metadata',
  );
  await expectRejection(
    () =>
      decryptWorkplaceDump(
        {
          ...dump,
          snapshot: {
            ...envelope,
            ciphertext: `${envelope.ciphertext[0] === 'A' ? 'B' : 'A'}${envelope.ciphertext.slice(1)}`,
          },
        },
        workplaceCredential,
      ),
    'Altered ciphertext',
  );
  progress('Verifying Device access without reading any private-key bytes');
  requireProof(
    await nativeKeyOperations.hasKey({ kind: 'device', userId: USER, deviceId: SOURCE_DEVICE }),
    'Native Device private key is missing',
  );
  requireProof(
    !('load' in nativeKeyOperations) && !('save' in nativeKeyOperations),
    'The native interface exposes raw-key operations',
  );
  const bundle: ProofBundle = {
    signedPackage,
    envelope,
    workplaceKeys,
    workplaceCredential,
    userCredential,
    userPackage: await keys.exportUserRecoveryPackage(USER, SOURCE_DEVICE),
    sourceFingerprint: await dataFingerprint(snapshot),
  };
  await writeProofBundle(bundle);
  return {
    stage: action,
    accounts: snapshot.data.accounts.length,
    journals: snapshot.data.journals.length,
    transactions: snapshot.data.transactions.length,
    plaintextBytes,
    captureMs: Math.round(captureMs),
    encryptMs: Math.round(encryptMs),
    recoverMs: Math.round(recoverMs),
    deviceVaultVerified: true,
    userSigningPairVerified: true,
    signedPackageVerified: true,
    tamperedSignatureRejected: true,
    wrongCodeRejected: true,
    tamperRejected: true,
    totalMs: Math.round(performance.now() - start),
  };
}

export async function restartProofStage(
  bundle: ProofBundle,
  progress: (message: string) => void,
): Promise<RecoveryProofReport> {
  assertE2eHarnessEnabled();
  progress('Reading the key saved by the previous app process');
  const snapshot = await keys.decryptSnapshot(
    {
      userId: USER,
      registeredDeviceId: SOURCE_DEVICE,
      userKeyFingerprint: bundle.userPackage.userKeyFingerprint,
    },
    DEMO,
    bundle.envelope,
  );
  requireProof(
    (await dataFingerprint(snapshot)) === bundle.sourceFingerprint,
    'Restart decrypted different books',
  );
  return { stage: 'restart', savedKeySurvived: true, journals: snapshot.data.journals.length };
}

export async function recoverProofStage(
  action: 'recover' | 'reinstall' | 'missing-device-key' | 'orphan-device-key',
  bundle: ProofBundle,
  progress: (message: string) => void,
  start: number,
): Promise<RecoveryProofReport> {
  assertE2eHarnessEnabled();
  const lifecycle = action === 'missing-device-key' || action === 'orphan-device-key';
  if (!lifecycle)
    requireProof(
      (await workplaceRepository.findAll()).length === 0,
      'Recovery proof requires an empty destination database',
    );
  if (action === 'missing-device-key') {
    await nativeKeyOperations.removeKey({ kind: 'device', userId: USER, deviceId: SOURCE_DEVICE });
  } else if (action === 'orphan-device-key') {
    await keyCiphertextStateStore.remove(userScope(USER, SOURCE_DEVICE));
    const orphan = await nativeKeyOperations.hasKey({
      kind: 'device',
      userId: USER,
      deviceId: SOURCE_DEVICE,
    });
    requireProof(orphan, 'Orphan-key proof needs a surviving native key');
  }
  if (lifecycle) {
    requireProof(
      (await keys.inspectDeviceState(USER, SOURCE_DEVICE)) === 'recovery-required',
      'Missing local material did not route to recovery',
    );
    await expectRejection(() => keys.beginUser(USER, SOURCE_DEVICE), 'Implicit root regeneration');
  }
  const sourceKeyWasAbsent = !(await nativeKeyOperations.hasKey({
    kind: 'device',
    userId: USER,
    deviceId: SOURCE_DEVICE,
  }));
  if (action === 'recover')
    requireProof(
      sourceKeyWasAbsent,
      'Replacement simulator unexpectedly has the source Device key',
    );
  // Every installation gets a fresh Device ID. Surviving orphan keys are never reused or deleted.
  const deviceId = `native-proof-${generator()}`;
  // The caller loaded ciphertext from an independent file before invoking native recovery.
  progress('Recovering the same User onto an independent Device');
  const recoveryStart = performance.now();
  const identity = await keys.recoverUserDevice(
    bundle.userCredential,
    bundle.userPackage,
    deviceId,
  );
  // Lifecycle tests retain Workplace envelopes; installation-loss tests load them from the independently saved bundle.
  if (!lifecycle) await keys.installWorkplaceKeys(identity, bundle.workplaceKeys);
  const recovered = await keys.decryptSnapshot(identity, DEMO, bundle.envelope);
  const recoveryMs = performance.now() - recoveryStart;
  requireProof(
    identity.userId === USER &&
      identity.userKeyFingerprint === bundle.userPackage.userKeyFingerprint,
    'Recovery replaced the User identity',
  );
  requireProof(
    (await dataFingerprint(recovered)) === bundle.sourceFingerprint,
    'Recovery does not match the source books',
  );
  if (lifecycle) {
    requireProof(
      (await keys.inspectDeviceState(USER, deviceId)) === 'ready',
      'Recovered Device is not usable',
    );
    const actual = await captureWorkplaceSnapshot(DEMO);
    requireProof(
      (await dataFingerprint(actual, recovered)) === bundle.sourceFingerprint,
      'Lifecycle recovery altered existing books',
    );
    const orphan = await nativeKeyOperations.hasKey({
      kind: 'device',
      userId: USER,
      deviceId: SOURCE_DEVICE,
    });
    requireProof(action !== 'orphan-device-key' || orphan, 'Recovery deleted the orphan key');
    return {
      stage: action!,
      recoveryRequired: true,
      sameUserIdentityVerified: true,
      sameSigningIdentityVerified: true,
      sameDekVerified: true,
      existingDataUnchanged: true,
      orphanPreserved: action === 'orphan-device-key',
      totalMs: Math.round(performance.now() - start),
    };
  }
  progress('Publishing original record identities atomically');
  const restoreStart = performance.now();
  const publication = await restoreWorkplaceSnapshot(recovered);
  const restoreMs = performance.now() - restoreStart;
  const actual = await captureWorkplaceSnapshot(DEMO);
  requireProof(
    JSON.stringify(actual.workplace) === JSON.stringify(recovered.workplace) &&
      JSON.stringify(publication.bookPreferences) === JSON.stringify(recovered.bookPreferences),
    'Recovery changed book identity or configuration',
  );
  requireProof(
    (await dataFingerprint(actual, recovered)) === bundle.sourceFingerprint,
    'Published records differ from the source',
  );
  const auditBefore = await database.get('audit_logs').query().fetchCount();
  await restoreWorkplaceSnapshot(recovered);
  requireProof(
    (await database.get('audit_logs').query().fetchCount()) === auditBefore,
    'Retry duplicated audit history',
  );
  requireProof(
    (await workplaceRepository.findAll()).length === 1,
    'Recovery created an extra Workplace',
  );
  return {
    stage: action,
    sourceKeyWasAbsent,
    sameSigningIdentityVerified: true,
    recoveredUsingCode: true,
    recordIdentityAndContentVerified: true,
    bookConfigurationVerified: true,
    retryDidNotDuplicate: true,
    journals: recovered.data.journals.length,
    recoveryMs: Math.round(recoveryMs),
    restoreMs: Math.round(restoreMs),
    totalMs: Math.round(performance.now() - start),
  };
}
