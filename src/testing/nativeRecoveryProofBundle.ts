import { File, Paths } from 'expo-file-system';
import { nativeKeyOperations } from '@/src/services/backup/nativeKeyOperations';
import type { EncryptedSnapshot } from '@/src/services/backup/encryptedSnapshot';
import type { UserRecoveryPackage, WorkplaceKeys } from '@/src/services/backup/keyHierarchyRecords';
import type { LocalRecoveryPackage } from '@/src/services/backup/localRecoveryPackage';
import type { RecoveryCredential } from '@/src/services/backup/keyEnvelopes';
import { DEMO, USER, requireProof } from './nativeRecoveryProofFixtures';
import { assertE2eHarnessEnabled } from './e2eRuntimeGate';

const LOCAL_BUNDLE = 'native-recovery-proof.json';
export type ProofBundle = {
  signedPackage: LocalRecoveryPackage;
  envelope: EncryptedSnapshot;
  userPackage: UserRecoveryPackage;
  userCredential: RecoveryCredential;
  workplaceKeys: WorkplaceKeys;
  workplaceCredential: RecoveryCredential;
  sourceFingerprint: string;
};
function localFile(): File {
  return new File(Paths.document, LOCAL_BUNDLE);
}

export async function readProofBundle(path?: string): Promise<ProofBundle> {
  assertE2eHarnessEnabled();
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

/** Native credential export keeps the secrets outside JS, beside the public/encrypted bundle. */
export async function writeProofBundle(bundle: ProofBundle): Promise<void> {
  assertE2eHarnessEnabled();
  // Even the native proof exports credentials directly to files; JS sees handles only.
  for (const [credential, name] of [
    [bundle.userCredential, 'native-recovery-user-secret.json'],
    [bundle.workplaceCredential, 'native-recovery-workplace-secret.json'],
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
}
