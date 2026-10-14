import { runNativeRecoveryProof } from '../nativeRecoveryProof';
import { readProofBundle } from '../nativeRecoveryProofBundle';
import {
  prepareProofStage,
  restartProofStage,
  recoverProofStage,
} from '../nativeRecoveryProofStages';
import { verifyLocalRecoveryPackage } from '@/src/services/backup/localRecoveryPackage';
import { preferences } from '@/src/services/preferences';
import { recoveryProofFixture } from './recoveryProofFixture';

jest.mock('../e2eRuntimeGate', () => ({ assertE2eHarnessEnabled: jest.fn() }));
jest.mock('../nativeRecoveryProofBundle', () => ({ readProofBundle: jest.fn() }));
jest.mock('../nativeRecoveryProofStages', () => ({
  prepareProofStage: jest.fn(async action => ({ stage: action })),
  restartProofStage: jest.fn(async () => ({ stage: 'restart' })),
  recoverProofStage: jest.fn(async action => ({ stage: action })),
}));
jest.mock('@/src/services/backup/localRecoveryPackage', () => ({
  verifyLocalRecoveryPackage: jest.fn(),
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'info').mockImplementation(() => undefined);
  jest.spyOn(preferences, 'loadPreferences').mockResolvedValue(preferences.getSnapshot());
  jest.mocked(readProofBundle).mockResolvedValue(recoveryProofFixture());
  jest.mocked(verifyLocalRecoveryPackage).mockResolvedValue(recoveryProofFixture().signedPackage);
});
afterEach(() => jest.restoreAllMocks());

it.each([
  'prepare',
  'large',
  'restart',
  'recover',
  'reinstall',
  'missing-device-key',
  'orphan-device-key',
] as const)(
  'dispatches %s with its existing bundle verification and stage identity',
  async action => {
    const progress = jest.fn();
    await expect(
      runNativeRecoveryProof(
        { reset: false, recoveryAction: action, recoveryBundlePath: '/import/proof.json' },
        progress,
      ),
    ).resolves.toEqual({ stage: action });
    expect(preferences.loadPreferences).toHaveBeenCalledTimes(1);
    if (action === 'prepare' || action === 'large') {
      expect(prepareProofStage).toHaveBeenCalledWith(action, progress, expect.any(Number));
      expect(readProofBundle).not.toHaveBeenCalled();
      expect(verifyLocalRecoveryPackage).not.toHaveBeenCalled();
    } else {
      expect(readProofBundle).toHaveBeenCalledWith('/import/proof.json');
      expect(verifyLocalRecoveryPackage).toHaveBeenCalledWith(
        recoveryProofFixture().signedPackage,
        {
          userId: 'native-proof-user',
          userKeyFingerprint: recoveryProofFixture().userCredential.identityKeyId,
        },
      );
      const stage = action === 'restart' ? restartProofStage : recoverProofStage;
      expect(jest.mocked(verifyLocalRecoveryPackage).mock.invocationCallOrder[0]).toBeLessThan(
        jest.mocked(stage).mock.invocationCallOrder[0],
      );
      if (action === 'restart')
        expect(restartProofStage).toHaveBeenCalledWith(recoveryProofFixture(), progress);
      else
        expect(recoverProofStage).toHaveBeenCalledWith(
          action,
          recoveryProofFixture(),
          progress,
          expect.any(Number),
        );
    }
    expect(prepareProofStage).toHaveBeenCalledTimes(
      action === 'prepare' || action === 'large' ? 1 : 0,
    );
    expect(restartProofStage).toHaveBeenCalledTimes(action === 'restart' ? 1 : 0);
    expect(recoverProofStage).toHaveBeenCalledTimes(
      ['prepare', 'large', 'restart'].includes(action) ? 0 : 1,
    );
  },
);

it('rejects a failed package authentication before running a recovery stage', async () => {
  jest.mocked(verifyLocalRecoveryPackage).mockRejectedValueOnce(new Error('Signature mismatch'));
  await expect(
    runNativeRecoveryProof({ reset: false, recoveryAction: 'recover' }, jest.fn()),
  ).rejects.toThrow('Signature mismatch');
  expect(recoverProofStage).not.toHaveBeenCalled();
  expect(restartProofStage).not.toHaveBeenCalled();
  expect(prepareProofStage).not.toHaveBeenCalled();
});
