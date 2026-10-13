import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useEncryptionRecovery } from '../useEncryptionRecovery';
import { recoveryFiles } from '@/src/services/backup/recoveryFiles';
import { encryptionSetup } from '@/src/services/backup/encryptionSetup';
import { setKeyAccessAllowed } from '@/src/services/backup/keyAccessPolicy';
import { AppNavigation } from '@/src/utils/navigation';

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
  setKeyAccessAllowed(false);
  jest.restoreAllMocks();
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
