import { preferences } from '@/src/services/preferences';
import { verifyLocalRecoveryPackage } from '@/src/services/backup/localRecoveryPackage';
import { assertE2eHarnessEnabled } from './e2eRuntimeGate';
import type { E2eLaunchConfig } from './e2eLaunchArgs';
import { readProofBundle } from './nativeRecoveryProofBundle';
import { USER, requireProof } from './nativeRecoveryProofFixtures';
import {
  prepareProofStage,
  restartProofStage,
  recoverProofStage,
  type RecoveryProofReport,
} from './nativeRecoveryProofStages';

// Must be absent from production bundles, just like the existing destructive seed runner.
const PROOF_CAPABILITY = '__FFB_E2E_DESTRUCTIVE_BOOTSTRAP__';

/** Native-only proof over disposable demo books. Secrets never appear in progress/report/log output. */
export async function runNativeRecoveryProof(
  config: E2eLaunchConfig,
  progress: (message: string) => void,
): Promise<RecoveryProofReport> {
  assertE2eHarnessEnabled();
  const action = config.recoveryAction;
  requireProof(action, 'Recovery proof is disabled');
  console.info(`[RecoveryProof] ${PROOF_CAPABILITY}`);
  await preferences.loadPreferences();
  const start = performance.now();
  if (action === 'prepare' || action === 'large') return prepareProofStage(action, progress, start);

  const bundle = await readProofBundle(config.recoveryBundlePath);
  await verifyLocalRecoveryPackage(bundle.signedPackage, {
    userId: USER,
    userKeyFingerprint: bundle.userCredential.identityKeyId,
  });
  switch (action) {
    case 'restart':
      return restartProofStage(bundle, progress);
    case 'recover':
    case 'reinstall':
    case 'missing-device-key':
    case 'orphan-device-key':
      return recoverProofStage(action, bundle, progress, start);
  }
}
