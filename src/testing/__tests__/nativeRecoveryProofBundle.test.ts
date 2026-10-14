import type { WorkplaceSnapshot } from '@/src/services/backup/workplaceSnapshot';
import { workplaceRepository } from '@/src/data/repositories/WorkplaceRepository';
import { readProofBundle, writeProofBundle } from '../nativeRecoveryProofBundle';
import {
  prepareProofStage,
  restartProofStage,
  recoverProofStage,
} from '../nativeRecoveryProofStages';
import { runNativeRecoveryProof } from '../nativeRecoveryProof';
import { expandDemoBooks } from '../nativeRecoveryProofFixtures';
import { assertE2eHarnessEnabled } from '../e2eRuntimeGate';
import { nativeKeyOperations } from '@/src/services/backup/nativeKeyOperations';
import { recoveryProofFixture } from './recoveryProofFixture';
import { File } from 'expo-file-system';

const mockRead = jest.fn();
const mockCreate = jest.fn();
const mockWrite = jest.fn();
jest.mock('expo-file-system', () => ({
  Paths: { document: { uri: 'file:///proof/' } },
  File: jest.fn().mockImplementation((base: string | { uri: string }, name?: string) => ({
    uri: name ? `${typeof base === 'string' ? base : base.uri}${name}` : base,
    textSync: mockRead,
    create: mockCreate,
    write: mockWrite,
  })),
}));
jest.mock('../e2eRuntimeGate', () => ({ assertE2eHarnessEnabled: jest.fn() }));
jest.mock('@/src/data/repositories/WorkplaceRepository', () => ({
  workplaceRepository: { findAll: jest.fn(async () => []) },
}));
jest.mock('@/src/services/backup/nativeKeyOperations', () => ({
  nativeKeyOperations: {
    importCredential: jest.fn(),
    retainCredential: jest.fn(),
    writeCredential: jest.fn(),
    releaseCredential: jest.fn(),
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(assertE2eHarnessEnabled).mockImplementation(() => undefined);
  mockRead.mockReturnValue(JSON.stringify(recoveryProofFixture()));
  jest.mocked(nativeKeyOperations.writeCredential).mockResolvedValue(undefined);
});

it('loads adjacent secrets through native imports, replacing stale saved handles', async () => {
  const bundle = recoveryProofFixture();
  const user = { ...bundle.userCredential, handle: '77'.repeat(32) };
  const workplace = { ...bundle.workplaceCredential, handle: '88'.repeat(32) };
  jest
    .mocked(nativeKeyOperations.importCredential)
    .mockResolvedValueOnce(user)
    .mockResolvedValueOnce(workplace);
  const result = await readProofBundle('/external/native-recovery-proof.json');
  expect(nativeKeyOperations.importCredential).toHaveBeenNthCalledWith(
    1,
    'file:///external/native-recovery-user-secret.json',
  );
  expect(nativeKeyOperations.importCredential).toHaveBeenNthCalledWith(
    2,
    'file:///external/native-recovery-workplace-secret.json',
  );
  expect(result.userCredential).toEqual(user);
  expect(result.workplaceCredential).toEqual(workplace);
});

it('rejects a non-demo bundle before importing any credential', async () => {
  const bundle = recoveryProofFixture();
  bundle.envelope = { ...bundle.envelope, workplaceId: 'real-books' };
  mockRead.mockReturnValue(JSON.stringify(bundle));
  await expect(readProofBundle()).rejects.toThrow('Only the disposable demo proof');
  expect(nativeKeyOperations.importCredential).not.toHaveBeenCalled();
});

it('exports native credentials before publishing the public/encrypted bundle', async () => {
  const bundle = recoveryProofFixture();
  await writeProofBundle(bundle);
  expect(nativeKeyOperations.writeCredential).toHaveBeenNthCalledWith(
    1,
    bundle.userCredential,
    'file:///proof/native-recovery-user-secret.json',
  );
  expect(nativeKeyOperations.writeCredential).toHaveBeenNthCalledWith(
    2,
    bundle.workplaceCredential,
    'file:///proof/native-recovery-workplace-secret.json',
  );
  expect(nativeKeyOperations.releaseCredential).toHaveBeenNthCalledWith(1, bundle.userCredential);
  expect(nativeKeyOperations.releaseCredential).toHaveBeenNthCalledWith(
    2,
    bundle.workplaceCredential,
  );
  expect(mockCreate).toHaveBeenCalledWith({ overwrite: true });
  expect(mockWrite).toHaveBeenCalledWith(JSON.stringify(bundle));
});

it('releases the retained handle and never publishes a bundle if native export fails', async () => {
  const bundle = recoveryProofFixture();
  jest
    .mocked(nativeKeyOperations.writeCredential)
    .mockRejectedValueOnce(new Error('export failed'));
  await expect(writeProofBundle(bundle)).rejects.toThrow('export failed');
  expect(nativeKeyOperations.releaseCredential).toHaveBeenCalledWith(bundle.userCredential);
  expect(mockWrite).not.toHaveBeenCalled();
});

it.each(['runner', 'read', 'write', 'prepare', 'restart', 'recover', 'expand'] as const)(
  'blocks the %s entry point before any file/native mutation when the harness is disabled',
  async entry => {
    jest.mocked(assertE2eHarnessEnabled).mockImplementation(() => {
      throw new Error('Harness disabled');
    });
    const bundle = recoveryProofFixture();
    const progress = jest.fn();
    const emptySnapshot: WorkplaceSnapshot = {
      format: 'full-frills-workplace-snapshot',
      formatVersion: 1,
      schemaVersion: 1,
      capturedAt: 0,
      workplace: { id: 'demo_workspace', name: 'Demo', icon: 'book', defaultCurrencyCode: 'USD' },
      bookPreferences: { safeToSpendDays: 30 },
      currencyPrecisions: {},
      data: { accounts: [], journals: [], transactions: [] },
    };
    const calls = {
      runner: () => runNativeRecoveryProof({ reset: false, recoveryAction: 'prepare' }, progress),
      read: () => readProofBundle(),
      write: () => writeProofBundle(bundle),
      prepare: () => prepareProofStage('prepare', progress, 0),
      restart: () => restartProofStage(bundle, progress),
      recover: () => recoverProofStage('recover', bundle, progress, 0),
      expand: () => expandDemoBooks(emptySnapshot, 1),
    };
    await expect(calls[entry]()).rejects.toThrow('Harness disabled');
    expect(workplaceRepository.findAll).not.toHaveBeenCalled();
    expect(File).not.toHaveBeenCalled();
    expect(nativeKeyOperations.importCredential).not.toHaveBeenCalled();
    expect(nativeKeyOperations.writeCredential).not.toHaveBeenCalled();
    expect(progress).not.toHaveBeenCalled();
  },
);
