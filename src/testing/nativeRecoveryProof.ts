import { database } from '@/src/data/database/Database';
import { importRepository } from '@/src/data/repositories/ImportRepository';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import {
  captureWorkplaceSnapshot,
  serializeWorkplaceSnapshot,
  SNAPSHOT_TABLES,
  type WorkplaceSnapshot,
} from '@/src/services/backup/workplaceSnapshot';
import {
  snapshotFingerprint,
  type EncryptedSnapshot,
} from '@/src/services/backup/encryptedSnapshot';
import { nativeKeyOperations } from '@/src/services/backup/nativeKeyOperations';
import { deviceKeyVault } from '@/src/services/backup/deviceKeyVault';
import { keyCiphertextStateStore } from '@/src/services/backup/keyCiphertextStateStore';
import {
  LocalKeyHierarchy,
  type UserRecoveryPackage,
  type WorkplaceKeys,
} from '@/src/services/backup/localKeyHierarchy';
import { createWorkplaceDump, decryptWorkplaceDump } from '@/src/services/backup/workplaceDump';
import {
  createLocalRecoveryPackage,
  verifyLocalRecoveryPackage,
  type LocalRecoveryPackage,
} from '@/src/services/backup/localRecoveryPackage';
import type { RecoveryArtifactSource } from '@/src/services/backup/recoveryArtifactSource';
import type { RecoveryCredential } from '@/src/services/backup/keyEnvelopes';
import { mockDataSeederService } from '@/src/services/import/MockDataSeederService';
import { restoreWorkplaceSnapshot } from '@/src/services/import/restoreWorkplaceSnapshot';
import { preferences } from '@/src/services/preferences';
import { asAccountId, asJournalId, asWorkplaceId } from '@/src/types/ids';
import { generator } from '@/src/data/database/idGenerator';
import type { BatchImportData } from '@/src/types/importContracts';
import { JournalStatus } from '@/src/types/enums';
import { File, Paths } from 'expo-file-system';
import * as SecureStore from 'expo-secure-store';
import { assertE2eHarnessEnabled } from './e2eRuntimeGate';
import type { E2eLaunchConfig } from './e2eLaunchArgs';

// Must be absent from production bundles, just like the existing destructive seed runner.
const PROOF_CAPABILITY = '__FFB_E2E_DESTRUCTIVE_BOOTSTRAP__';
const DEMO = asWorkplaceId('demo_workspace');
const LOCAL_BUNDLE = 'native-recovery-proof.json';
const USER = 'native-proof-user';
const SOURCE_DEVICE = 'native-proof-source';
const keys = new LocalKeyHierarchy(keyCiphertextStateStore, assertE2eHarnessEnabled);
type ProofBundle = {
  signedPackage: LocalRecoveryPackage;
  envelope: EncryptedSnapshot;
  userPackage: UserRecoveryPackage;
  userCredential: RecoveryCredential;
  workplaceKeys: WorkplaceKeys;
  workplaceCredential: RecoveryCredential;
  sourceFingerprint: string;
};
export type RecoveryProofReport = Record<string, number | string | boolean>;

function requireProof(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function localFile(): File {
  return new File(Paths.document, LOCAL_BUNDLE);
}

async function readBundle(path?: string): Promise<ProofBundle> {
  const file = path ? new File(path.startsWith('/') ? `file://${path}` : path) : localFile();
  const value: unknown = JSON.parse(file.textSync());
  requireProof(value && typeof value === 'object', 'Missing recovery proof bundle');
  const bundle = value as Partial<ProofBundle>;
  requireProof(
    bundle.envelope?.workplaceId === DEMO &&
      bundle.userPackage?.userId === USER &&
      bundle.userCredential?.purpose === 'user-recovery' &&
      bundle.workplaceCredential?.purpose === 'workplace-dump' &&
      typeof bundle.sourceFingerprint === 'string',
    'Only the disposable demo proof is accepted',
  );
  const base = new URL('.', file.uri).href;
  bundle.userCredential = (await nativeKeyOperations.importCredential(
    new URL('native-recovery-user-secret.json', base).href,
  )) as RecoveryCredential;
  bundle.workplaceCredential = (await nativeKeyOperations.importCredential(
    new URL('native-recovery-workplace-secret.json', base).href,
  )) as RecoveryCredential;
  return bundle as ProofBundle;
}

async function expectRejection(work: () => Promise<unknown>, label: string): Promise<void> {
  let rejected = false;
  try {
    await work();
  } catch {
    rejected = true;
  }
  requireProof(rejected, `${label} was incorrectly accepted`);
}

async function dataFingerprint(
  snapshot: WorkplaceSnapshot,
  source?: WorkplaceSnapshot,
): Promise<string> {
  const data = Object.fromEntries(
    SNAPSHOT_TABLES.map(({ key }) => {
      const ids = source ? new Set((source.data[key] ?? []).map(row => row.id)) : undefined;
      const rows = [...(snapshot.data[key] ?? [])]
        .filter(row => !ids || ids.has(row.id))
        .sort((a, b) => a.id.localeCompare(b.id));
      return [key, rows];
    }),
  );
  return snapshotFingerprint(JSON.stringify(data));
}

async function expandDemoBooks(source: WorkplaceSnapshot, count: number): Promise<void> {
  const template = source.data.journals.find(
    journal =>
      journal.status === JournalStatus.POSTED &&
      !journal.originalJournalId &&
      !journal.reversingJournalId &&
      !journal.plannedPaymentId,
  );
  requireProof(template, 'Demo has no independent posted journal to expand');
  const sourceLines = source.data.transactions.filter(
    line => line.journalId === template.id && !line.deletedAt,
  );
  // Imports carry their complete account graph. Give the load entries their own accounts,
  // rather than depending on accounts outside this imported batch.
  const accountIds = new Set<string>(sourceLines.map(line => line.accountId));
  const accountMap = new Map<string, ReturnType<typeof asAccountId>>(
    [...accountIds].map(id => [id, asAccountId(generator())]),
  );
  const accounts = source.data.accounts
    .filter(account => accountIds.has(account.id))
    .map(account => ({
      ...account,
      id: accountMap.get(account.id)!,
      name: `Recovery load fixture ${account.name}`,
      parentAccountId: account.parentAccountId
        ? accountMap.get(account.parentAccountId)
        : undefined,
    }));
  const data: BatchImportData = { accounts, journals: [], transactions: [] };
  for (let index = 0; index < count; index++) {
    const id = asJournalId(generator());
    data.journals.push({ ...template, id, description: 'Disposable recovery load fixture' });
    data.transactions.push(
      ...sourceLines.map(line => ({
        ...line,
        id: generator(),
        journalId: id,
        accountId: accountMap.get(line.accountId)!,
      })),
    );
  }
  await importRepository.batchInsert(DEMO, data);
}

/** Native-only proof over disposable demo books. Secrets never appear in progress/report/log output. */
export async function runNativeRecoveryProof(
  config: E2eLaunchConfig,
  progress: (message: string) => void,
): Promise<RecoveryProofReport> {
  assertE2eHarnessEnabled();
  requireProof(PROOF_CAPABILITY.length > 0 && config.recoveryAction, 'Recovery proof is disabled');
  console.info(`[RecoveryProof] ${PROOF_CAPABILITY}`);
  await preferences.loadPreferences();
  const start = performance.now();
  if (config.recoveryAction === 'prepare' || config.recoveryAction === 'large') {
    requireProof(
      (await workplaceRepository.findAll()).length === 0,
      'Creation proof requires a fresh simulator installation',
    );
    // iOS keychain can outlive uninstall. This exact demo-only key belongs to this isolated proof.
    await SecureStore.deleteItemAsync(`workplace_snapshot_key_v1_${DEMO}`); // Remove the obsolete disposable proof key.
    await keyCiphertextStateStore.remove(JSON.stringify(['identity', USER]));
    await deviceKeyVault.remove(USER, SOURCE_DEVICE);
    await keyCiphertextStateStore.remove(JSON.stringify(['user', USER, SOURCE_DEVICE]));
    await keyCiphertextStateStore.remove(JSON.stringify(['workplace', USER, DEMO]));
    const userCredential = await keys.beginUser(USER, SOURCE_DEVICE);
    const identity = await keys.confirmUserRecovery(USER, SOURCE_DEVICE, userCredential);
    const workplaceCredential = await keys.enrollWorkplace(identity, DEMO, 'local-upgrade');
    await keys.confirmWorkplaceRecovery(identity, DEMO, workplaceCredential);
    progress('Creating books with the development demo generator');
    await mockDataSeederService.seedMockData(undefined, { refreshExchangeRates: false });
    if (config.recoveryAction === 'large') {
      progress('Adding 5,000 disposable journal entries');
      await expandDemoBooks(await captureWorkplaceSnapshot(DEMO), 5_000);
    }
    progress('Capturing a consistent snapshot');
    const captureStart = performance.now();
    const snapshot = await captureWorkplaceSnapshot(DEMO);
    const captureMs = performance.now() - captureStart;
    const plaintextBytes = new TextEncoder().encode(
      serializeWorkplaceSnapshot(snapshot),
    ).byteLength;
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
      !('load' in deviceKeyVault) && !('save' in deviceKeyVault),
      'The JS vault exposes raw-key operations',
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
    // Even the native proof exports credentials directly to files; JS sees handles only.
    for (const [credential, name] of [
      [userCredential, 'native-recovery-user-secret.json'],
      [workplaceCredential, 'native-recovery-workplace-secret.json'],
    ] as const) {
      const destination = new File(Paths.document, name);
      await nativeKeyOperations.retainCredential(credential);
      try {
        await nativeKeyOperations.writeCredential(credential, destination.uri);
      } finally {
        await nativeKeyOperations.releaseCredential(credential);
      }
    }
    const output = localFile();
    output.create({ overwrite: true });
    output.write(JSON.stringify(bundle));
    return {
      stage: config.recoveryAction,
      accounts: snapshot.data.accounts.length,
      journals: snapshot.data.journals.length,
      transactions: snapshot.data.transactions.length,
      plaintextBytes,
      captureMs: Math.round(captureMs),
      encryptMs: Math.round(encryptMs),
      recoverMs: Math.round(recoverMs),
      secureStoreVerified: true,
      userSigningPairVerified: true,
      signedPackageVerified: true,
      tamperedSignatureRejected: true,
      wrongCodeRejected: true,
      tamperRejected: true,
      totalMs: Math.round(performance.now() - start),
    };
  }

  const bundle = await readBundle(config.recoveryBundlePath);
  await verifyLocalRecoveryPackage(bundle.signedPackage, {
    userId: USER,
    userKeyFingerprint: bundle.userCredential.identityKeyId,
  });
  if (config.recoveryAction === 'restart') {
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

  const lifecycle =
    config.recoveryAction === 'missing-device-key' || config.recoveryAction === 'orphan-device-key';
  if (!lifecycle)
    requireProof(
      (await workplaceRepository.findAll()).length === 0,
      'Recovery proof requires an empty destination database',
    );
  if (config.recoveryAction === 'missing-device-key') {
    await deviceKeyVault.remove(USER, SOURCE_DEVICE);
  } else if (config.recoveryAction === 'orphan-device-key') {
    await keyCiphertextStateStore.remove(JSON.stringify(['user', USER, SOURCE_DEVICE]));
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
  if (config.recoveryAction === 'recover')
    requireProof(
      sourceKeyWasAbsent,
      'Replacement simulator unexpectedly has the source Device key',
    );
  // Every installation gets a fresh Device ID. Surviving orphan keys are never reused or deleted.
  const deviceId = `native-proof-${generator()}`;
  // Persistent test backend stand-in: independent of Device vault/local User state.
  // Phase 2 injects an authorized cloud adapter at this same boundary. No phrase reaches it.
  const source: RecoveryArtifactSource = {
    async loadUserRecoveryPackage(userId) {
      return userId === USER ? bundle.userPackage : null;
    },
  };
  progress('Recovering the same User onto an independent Device');
  const recoveryStart = performance.now();
  const identity = await keys.recoverUserFromSource(bundle.userCredential, source, deviceId);
  // Lifecycle tests retain Workplace envelopes; installation-loss tests fetch them from the stand-in.
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
    requireProof(
      config.recoveryAction !== 'orphan-device-key' || orphan,
      'Recovery deleted the orphan key',
    );
    return {
      stage: config.recoveryAction!,
      recoveryRequired: true,
      sameUserIdentityVerified: true,
      sameSigningIdentityVerified: true,
      sameDekVerified: true,
      existingDataUnchanged: true,
      orphanPreserved: config.recoveryAction === 'orphan-device-key',
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
    stage: config.recoveryAction,
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
