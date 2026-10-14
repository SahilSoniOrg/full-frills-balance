import { completeRecoveredWorkplaceSetup } from '@/src/services/setup/recoveryCompletion';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useEncryptionRecovery } from '../useEncryptionRecovery';
import { recoveryFiles } from '@/src/services/backup/recoveryFiles';
import { encryptionSetup } from '@/src/services/backup/encryptionSetup';
import { setKeyAccessAllowed } from '@/src/services/backup/keyAccessPolicy';
import { AppNavigation } from '@/src/utils/navigation';
import { saveSetupDraft, clearSetupDraft } from '@/src/services/setup/SetupDraftStore';
import { readBlockingSetupProjection } from '@/src/services/setup/readBlockingSetupProjection';
import type { WorkplaceCreationSetupDraft } from '@/src/services/setup/setupTypes';
import { readSetupDraftSnapshot } from '@/src/services/setup/launchProjection';
import { resolveLaunchGate } from '@/src/services/launch/launchResolver';
import { asWorkplaceId } from '@/src/types/ids';
import { preferences } from '@/src/services/preferences';
import { KeyOperationError } from '@/src/utils/keyOperationError';
import { logger } from '@/src/utils/logger';

function emptyDeviceDraft(id: string): WorkplaceCreationSetupDraft {
  return {
    schemaVersion: 1,
    kind: 'workplace_creation',
    journeyId: 'empty_device_workplace',
    entryPolicy: 'blocking',
    operationId: asWorkplaceId(id),
    presentedHistory: [],
    acceptedSlices: [],
  };
}

jest.mock('@/src/utils/storage', () => {
  const memory = new Map<string, string>();
  return {
    storage: {
      getString: jest.fn((key: string) => memory.get(key)),
      set: jest.fn((key: string, value: string) => {
        memory.set(key, value);
      }),
      remove: jest.fn((key: string) => {
        memory.delete(key);
      }),
    },
  };
});

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual('react');
    useEffect(callback, [callback]);
  },
}));
jest.mock('@/src/contexts/app-shell/AppLockProvider', () => ({
  useAppLock: () => ({ isAppCurrentlyLocked: false }),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({ useOptionalWorkplace: () => null }));
jest.mock('@/src/services/backup/encryptionSetup', () => ({
  encryptionSetup: {
    inspect: jest.fn(async () => ({
      session: null,
      keys: null,
      packageReady: false,
      packageSaved: false,
    })),
    recover: jest.fn(),
    finishRecoveryCompletion: jest.fn(),
    preparePackage: jest.fn(),
    savedPackage: jest.fn(),
    beginUser: jest.fn(),
  },
}));
jest.mock('@/src/services/backup/recoveryFiles', () => ({
  recoveryFiles: {
    cleanupTemporarySecrets: jest.fn(async () => undefined),
    pickPackage: jest.fn(),
    pickSecret: jest.fn(),
    exportPackage: jest.fn(),
  },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: { workplace: { replace: jest.fn() }, device: { update: jest.fn() } },
}));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { toDashboard: jest.fn() } }));
jest.mock('@/src/utils/alerts', () => ({ confirm: { show: jest.fn() } }));

let mockRecoveryDraft: string | undefined;
let mockCompletionSequence = 0;
let stateChanged: (value: 'active' | 'background') => void;
const mockStateListeners = new Set<(value: 'active' | 'background') => void>();
beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(encryptionSetup.finishRecoveryCompletion).mockImplementation(async () => {
    const invocation = jest.mocked(encryptionSetup.recover).mock.results.at(-1);
    if (invocation?.type === 'return')
      completeRecoveredWorkplaceSetup(
        await invocation.value,
        mockRecoveryDraft,
        (++mockCompletionSequence).toString(16).padStart(32, '0'),
      );
  });
  clearSetupDraft();
  AppState.currentState = 'active';
  setKeyAccessAllowed(true);
  mockStateListeners.clear();
  stateChanged = value => {
    AppState.currentState = value;
    for (const listener of [...mockStateListeners]) listener(value);
  };
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    mockStateListeners.add(callback);
    return {
      remove: () => {
        mockStateListeners.delete(callback);
      },
    };
  });
  jest.mocked(recoveryFiles.pickPackage).mockImplementation(async () => {
    stateChanged('background');
    stateChanged('active');
    return { encrypted: 'test-package' };
  });
  jest.mocked(recoveryFiles.pickSecret).mockImplementation(async () => {
    stateChanged('background');
    stateChanged('active');
    return { phrase: 'test-only-secret' };
  });
});
afterEach(() => {
  clearSetupDraft();
  setKeyAccessAllowed(false);
  jest.restoreAllMocks();
});

it('finishes the empty-device setup gate after recovery so the next launch opens the recovered books', async () => {
  const workplaceId = asWorkplaceId('recovered');
  saveSetupDraft(emptyDeviceDraft('unused-creation'));
  expect(readBlockingSetupProjection(readSetupDraftSnapshot())).toMatchObject({
    journeyId: 'empty_device_workplace',
    entryPolicy: 'blocking',
  });
  const { result, unmount } = await selectedFiles();
  jest.mocked(encryptionSetup.recover).mockResolvedValueOnce({
    kind: 'restored',
    workplaceId,
    bookPreferences: { safeToSpendDays: 45 },
  });
  await act(async () => {
    await result.current.recover();
  });
  expect(AppNavigation.toDashboard).toHaveBeenCalled();
  expect(
    resolveLaunchGate({
      setupDraft: readBlockingSetupProjection(readSetupDraftSnapshot()),
      deviceClaimed: true,
      activeWorkplaceId: workplaceId,
      workplaceIds: [workplaceId],
    }),
  ).toMatchObject({ kind: 'open', workplaceId });
  unmount();
});

it('preserves newer local preferences when only key access is recovered', async () => {
  const { result, unmount } = await selectedFiles();
  jest.mocked(encryptionSetup.recover).mockResolvedValueOnce({
    kind: 'keys-recovered',
    workplaceId: asWorkplaceId('existing-books'),
  });
  await act(async () => {
    await result.current.recover();
  });
  expect(preferences.workplace.replace).not.toHaveBeenCalled();
  expect(AppNavigation.toDashboard).toHaveBeenCalled();
  unmount();
});

it('retry reinspects after a failed inspection without repeating a recovery operation', async () => {
  jest
    .mocked(encryptionSetup.inspect)
    .mockRejectedValueOnce(new KeyOperationError('FFB_KEY_RECOVERY_REQUIRED'));
  const { result, unmount } = renderHook(() => useEncryptionRecovery());
  await waitFor(() => expect(result.current.message).not.toBeNull());
  await act(async () => {
    await result.current.retry();
  });
  expect(result.current.state).not.toBeNull();
  expect(encryptionSetup.inspect).toHaveBeenCalledTimes(2);
  expect(encryptionSetup.recover).not.toHaveBeenCalled();
  expect(result.current.busy).toBe(false);
  unmount();
});

it('does not retain a generated handle after backgrounding and returning during key creation', async () => {
  const { result, unmount } = renderHook(() => useEncryptionRecovery());
  await waitFor(() => expect(result.current.state).not.toBeNull());
  jest.mocked(encryptionSetup.beginUser).mockImplementationOnce(async () => {
    stateChanged('background');
    stateChanged('active');
    return {
      format: 'full-frills-recovery-handle',
      formatVersion: 1,
      purpose: 'user-recovery',
      identityId: 'user',
      identityKeyId: 'pin',
      recoveryKeyId: 'recovery-pin',
      handle: 'expired',
    };
  });
  await act(async () => {
    await result.current.begin();
  });
  expect(result.current.hasGeneratedSecret).toBe(false);
  expect(result.current.message).not.toBeNull();
  expect(result.current.busy).toBe(false);
  unmount();
});

it('rejects a picked secret if the app locks before the picker returns', async () => {
  const { result, unmount } = renderHook(() => useEncryptionRecovery());
  await waitFor(() => expect(result.current.state).not.toBeNull());
  await act(async () => {
    await result.current.pickPackage();
  });
  jest.mocked(recoveryFiles.pickSecret).mockImplementationOnce(async () => {
    setKeyAccessAllowed(false);
    return { handle: 'discarded' };
  });
  await act(async () => {
    await result.current.pickSecret();
  });
  expect(result.current.hasImportedSecret).toBe(false);
  expect(result.current.message).toContain('Unlock the app');
  unmount();
});

it('finishes durable activation but does not navigate after committed recovery returns cancelled', async () => {
  saveSetupDraft(emptyDeviceDraft('pending'));
  const draft = readSetupDraftSnapshot();
  const { result, unmount } = await selectedFiles();
  jest.mocked(encryptionSetup.recover).mockImplementationOnce(async () => {
    stateChanged('background');
    stateChanged('active');
    return { kind: 'keys-recovered', workplaceId: asWorkplaceId('recovered') };
  });
  await act(async () => {
    await result.current.recover();
  });
  expect(preferences.device.update).toHaveBeenCalled();
  expect(AppNavigation.toDashboard).not.toHaveBeenCalled();
  expect(readSetupDraftSnapshot()).not.toBe(draft);
  unmount();
});

it('keeps the setup gate when recovery fails', async () => {
  saveSetupDraft(emptyDeviceDraft('pending'));
  const expected = readSetupDraftSnapshot();
  const { result, unmount } = await selectedFiles();
  jest.mocked(encryptionSetup.recover).mockRejectedValueOnce(new Error('invalid package'));
  await act(async () => {
    await result.current.recover();
  });
  expect(readSetupDraftSnapshot()).toBe(expected);
  expect(AppNavigation.toDashboard).not.toHaveBeenCalled();
  unmount();
});

it('explains a Workplace collision without hiding the way to preserve local books', async () => {
  const { result, unmount } = await selectedFiles();
  jest
    .mocked(encryptionSetup.recover)
    .mockRejectedValueOnce(new KeyOperationError('FFB_KEY_WORKPLACE_COLLISION'));
  await act(async () => {
    await result.current.recover();
  });
  expect(result.current.message).toContain('Export your current books first');
  expect(AppNavigation.toDashboard).not.toHaveBeenCalled();
  unmount();
});

it('shows an allowlisted native reason without exposing decorated exception text', async () => {
  const { result, unmount } = await selectedFiles();
  const warning = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
  jest
    .mocked(encryptionSetup.recover)
    .mockRejectedValueOnce(new Error('native rejected: FFB_KEY_LOCKED sensitive-fixture-content'));
  await act(async () => {
    await result.current.recover();
  });
  expect(result.current.message).toContain('Unlock the app');
  expect(result.current.message).not.toContain('sensitive-fixture-content');
  expect(warning).toHaveBeenCalledWith('Private backup operation failed', {
    code: 'FFB_KEY_LOCKED',
  });
  unmount();
});

it('does not discard another setup journey changed while recovery was in flight', async () => {
  saveSetupDraft(emptyDeviceDraft('original'));
  const { result, unmount } = await selectedFiles();
  let newerDraft: string | undefined;
  jest.mocked(encryptionSetup.recover).mockImplementationOnce(async () => {
    saveSetupDraft(emptyDeviceDraft('different-operation'));
    newerDraft = readSetupDraftSnapshot();
    return {
      kind: 'restored',
      workplaceId: asWorkplaceId('restored'),
      bookPreferences: { safeToSpendDays: 45 },
    };
  });
  await act(async () => {
    await result.current.recover();
  });
  expect(readSetupDraftSnapshot()).toBe(newerDraft);
  unmount();
});

async function selectedFiles() {
  mockRecoveryDraft = readSetupDraftSnapshot();
  const hook = renderHook(() => useEncryptionRecovery());
  await waitFor(() => expect(hook.result.current.state).not.toBeNull());
  await act(async () => {
    await hook.result.current.pickPackage();
  });
  await act(async () => {
    await hook.result.current.pickSecret();
  });
  return hook;
}

it('retains only ciphertext across the second picker and clears the secret on background', async () => {
  const { result, unmount } = await selectedFiles();
  expect(result.current.hasImportedPackage).toBe(true);
  expect(result.current.hasImportedSecret).toBe(true);
  act(() => {
    stateChanged('background');
  });
  expect(result.current.hasImportedPackage).toBe(true);
  expect(result.current.hasImportedSecret).toBe(false);
  unmount();
});

it.each(['background', 'lock'] as const)(
  'does not resume an in-flight restore after %s and return',
  async interruption => {
    const { result, unmount } = await selectedFiles();
    jest
      .mocked(encryptionSetup.recover)
      .mockImplementationOnce(async (_package, _secret, signal) => {
        if (interruption === 'background') {
          stateChanged('background');
          stateChanged('active');
        } else {
          setKeyAccessAllowed(false);
          setKeyAccessAllowed(true);
        }
        expect(signal?.aborted).toBe(true);
        throw new Error('Publication must not run');
      });
    await act(async () => {
      await result.current.recover();
    });
    expect(encryptionSetup.recover).toHaveBeenCalled();
    expect(AppNavigation.toDashboard).not.toHaveBeenCalled();
    expect(result.current.hasImportedSecret).toBe(false);
    unmount();
  },
);

it('waits for the active event when the native picker result arrives first', async () => {
  const { result, unmount } = await selectedFiles();
  jest.mocked(recoveryFiles.pickSecret).mockImplementationOnce(async () => {
    stateChanged('background');
    return { handle: 'native-selected' };
  });
  await act(async () => {
    const selecting = result.current.pickSecret();
    await new Promise(resolve => setTimeout(resolve, 0));
    stateChanged('active');
    await selecting;
  });
  expect(result.current.hasImportedSecret).toBe(true);
  unmount();
});
it('reports a cancelled package save without claiming that a file was saved', async () => {
  const { result, unmount } = renderHook(() => useEncryptionRecovery('books'));
  await waitFor(() => expect(result.current.state).not.toBeNull());
  jest
    .mocked(encryptionSetup.preparePackage)
    .mockResolvedValueOnce({} as Awaited<ReturnType<typeof encryptionSetup.preparePackage>>);
  jest.mocked(recoveryFiles.exportPackage).mockResolvedValueOnce(false);
  await act(async () => {
    await result.current.exportPackage();
  });
  expect(result.current.message).toContain('Save was cancelled');
  unmount();
});

it('does not reapply a completed recovery after its asynchronous acknowledgement is retried', () => {
  const publication = {
    kind: 'restored' as const,
    workplaceId: asWorkplaceId('completion-once'),
    bookPreferences: { safeToSpendDays: 90 },
  };
  const id = 'ab'.repeat(16);
  completeRecoveredWorkplaceSetup(publication, undefined, id);
  expect(preferences.workplace.replace).toHaveBeenCalledTimes(1);
  jest.mocked(preferences.workplace.replace).mockClear();
  jest.mocked(preferences.device.update).mockClear();
  completeRecoveredWorkplaceSetup(publication, undefined, id);
  expect(preferences.workplace.replace).not.toHaveBeenCalled();
  expect(preferences.device.update).not.toHaveBeenCalled();
});
