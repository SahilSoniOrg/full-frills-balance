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
  },
}));
jest.mock('@/src/services/backup/recoveryFiles', () => ({
  recoveryFiles: { pickPackage: jest.fn(), pickSecret: jest.fn() },
}));
jest.mock('@/src/services/preferences', () => ({
  preferences: { workplace: { replace: jest.fn() }, device: { update: jest.fn() } },
}));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { toDashboard: jest.fn() } }));
jest.mock('@/src/utils/alerts', () => ({ confirm: { show: jest.fn() } }));

let stateChanged: (value: 'active' | 'background') => void;
beforeEach(() => {
  jest.clearAllMocks();
  clearSetupDraft();
  AppState.currentState = 'active';
  setKeyAccessAllowed(true);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, callback) => {
    stateChanged = callback;
    return { remove: jest.fn() };
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
      .mockImplementationOnce(async (_package, _secret, assertIntent) => {
        if (interruption === 'background') {
          stateChanged('background');
          stateChanged('active');
        } else {
          setKeyAccessAllowed(false);
          setKeyAccessAllowed(true);
        }
        assertIntent?.();
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
