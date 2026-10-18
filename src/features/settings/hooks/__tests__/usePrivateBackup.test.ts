import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { usePrivateBackup } from '../usePrivateBackup';
import { encryptedBackupFiles } from '@/src/services/backup/encryptedBackupFiles';
import { recoveryFiles } from '@/src/services/backup/recoveryFiles';
import { encryptedRestoreWorkflow } from '@/src/services/backup/encryptedRestoreWorkflow';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { useOptionalWorkplace } from '@/src/contexts/WorkplaceContext';
import { alert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { database } from '@/src/data/database/Database';
import Workplace from '@/src/data/models/Workplace';
import { asWorkplaceId } from '@/src/types/ids';
import { encryptionSetup } from '@/src/services/backup/encryptionSetup';
import {
  completeEncryptedRestoreLaunch,
  needsEncryptedRestoreLaunchCompletion,
} from '@/src/features/setup';

jest.mock('expo-router', () => ({
  useFocusEffect: (callback: () => (() => void) | undefined) => {
    const React = jest.requireActual('react');
    React.useEffect(callback, [callback]);
  },
}));
jest.mock('@/src/contexts/app-shell/AppLockProvider', () => ({
  useAppLock: jest.fn(() => ({ isAppCurrentlyLocked: false })),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({ useOptionalWorkplace: jest.fn(() => null) }));
jest.mock('@/src/services/backup/encryptionSetup', () => ({
  encryptionSetup: {
    inspect: jest.fn().mockResolvedValue({ session: null, keys: null }),
    confirmUser: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/services/backup/recoveryFiles', () => ({
  recoveryFiles: {
    pickSecret: jest.fn(),
    cleanupTemporarySecrets: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('@/src/services/backup/encryptedBackupFiles', () => ({
  encryptedBackupFiles: { pickEncryptedBackupZip: jest.fn() },
}));
jest.mock('@/src/services/backup/keyAccessPolicy', () => ({
  assertKeyAccessAllowed: jest.fn(),
  subscribeKeyAccessPolicy: jest.fn(() => () => undefined),
}));
jest.mock('@/src/services/backup/encryptedRestoreWorkflow', () => ({
  encryptedRestoreWorkflow: {
    prepareRecoveryAttempt: jest.fn().mockResolvedValue('device'),
    restoreSelectedBackup: jest.fn(),
  },
}));
jest.mock('@/src/services/sync/encryptedBackupActions', () => ({
  createEncryptedBackupZip: jest.fn(),
}));
jest.mock('@/src/features/setup', () => ({
  needsEncryptedRestoreLaunchCompletion: jest.fn(),
  completeEncryptedRestoreLaunch: jest.fn(),
}));
jest.mock('@/src/utils/alerts', () => ({ confirm: {}, alert: { show: jest.fn() } }));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { toDashboard: jest.fn() } }));

describe('encrypted restore completion', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest
      .mocked(useAppLock)
      .mockReturnValue({ isAppCurrentlyLocked: false } as ReturnType<typeof useAppLock>);
    jest.mocked(useOptionalWorkplace).mockReturnValue(undefined);
    jest.mocked(needsEncryptedRestoreLaunchCompletion).mockReturnValue(false);
    jest.mocked(encryptionSetup.inspect).mockResolvedValue({ session: null, keys: null });
    AppState.currentState = 'active';
    jest.mocked(encryptedBackupFiles.pickEncryptedBackupZip).mockResolvedValue(new Uint8Array([1]));
    jest.mocked(recoveryFiles.pickSecret).mockResolvedValue({});
  });

  it('uses verified Device access without selecting a recovery file or creating a replacement Device', async () => {
    const identity = {
      userId: 'user',
      registeredDeviceId: 'approved-device',
      userKeyFingerprint: 'pin',
    };
    jest.mocked(encryptionSetup.inspect).mockResolvedValue({
      session: null,
      keys: { user: 'ready', identity, workplace: 'missing' },
    });
    const workplace = database.get<Workplace>('workplaces').prepareCreate(record => {
      record.name = 'Restored books';
      record.icon = 'briefcase';
      record.defaultCurrencyCode = 'INR';
    });
    jest.mocked(encryptedRestoreWorkflow.restoreSelectedBackup).mockResolvedValue({
      status: 'ready',
      identity,
      workplace,
      manifestHash: 'manifest',
      rowCount: 1,
      warnings: [],
    });
    const { result } = renderHook(() => usePrivateBackup());
    await act(async () => undefined);
    expect(result.current.canRestoreWithDevice).toBe(true);
    await act(async () => {
      await result.current.pickBackup();
    });
    await act(async () => {
      await result.current.restoreFromFiles();
    });
    expect(encryptedRestoreWorkflow.restoreSelectedBackup).toHaveBeenCalledWith({
      archive: new Uint8Array([1]),
      credential: null,
      existingIdentity: identity,
      signal: expect.any(AbortSignal),
      onBeforePublish: expect.any(Function),
    });
    expect(recoveryFiles.pickSecret).not.toHaveBeenCalled();
    expect(encryptedRestoreWorkflow.prepareRecoveryAttempt).not.toHaveBeenCalled();
    expect(AppNavigation.toDashboard).toHaveBeenCalledTimes(1);
  });

  it('hands published restores to launch without activating or navigating from the screen', async () => {
    jest.mocked(encryptedRestoreWorkflow.restoreSelectedBackup).mockResolvedValue({
      status: 'completion-pending',
      identity: { userId: 'user', registeredDeviceId: 'device', userKeyFingerprint: 'pin' },
      workplace: { id: 'workplace' } as Workplace,
      manifestHash: 'manifest',
      rowCount: 1,
      warnings: [],
    });
    const { result } = renderHook(() => usePrivateBackup());
    await act(async () => {
      await result.current.pickBackup();
    });
    await act(async () => {
      await result.current.pickRecoverySecret();
    });
    await act(async () => {
      await result.current.restoreFromFiles();
    });
    expect(completeEncryptedRestoreLaunch).not.toHaveBeenCalled();
    expect(AppNavigation.toDashboard).not.toHaveBeenCalled();
    expect(result.current.hasImportedBackup).toBe(false);
    expect(result.current.hasImportedSecret).toBe(false);
  });

  it.each([
    { firstRun: false, hasWarning: true },
    { firstRun: true, hasWarning: true },
    { firstRun: false, hasWarning: false },
    { firstRun: true, hasWarning: false },
  ])(
    'completes restore and reports warnings (first run: $firstRun, warning: $hasWarning)',
    async ({ firstRun, hasWarning }) => {
      jest.mocked(needsEncryptedRestoreLaunchCompletion).mockReturnValue(firstRun);
      const setWorkplaceId = jest.fn().mockResolvedValue(undefined);
      jest.mocked(useOptionalWorkplace).mockReturnValue({
        workplaceId: asWorkplaceId('existing-workplace'),
        defaultCurrencyCode: 'INR',
        setWorkplaceId,
        deleteWorkplace: jest.fn(),
      });
      const workplace = database.get<Workplace>('workplaces').prepareCreate(record => {
        record.name = 'Restored books';
        record.icon = 'briefcase';
        record.defaultCurrencyCode = 'INR';
      });
      jest.mocked(encryptedRestoreWorkflow.restoreSelectedBackup).mockResolvedValue({
        status: 'ready',
        identity: { userId: 'user', registeredDeviceId: 'device', userKeyFingerprint: 'pin' },
        workplace,
        manifestHash: 'manifest',
        rowCount: 1,
        warnings: hasWarning ? ['Post-restore running-balance rebuild failed'] : [],
      });
      const { result } = renderHook(() => usePrivateBackup());
      await act(async () => {
        await result.current.pickBackup();
      });
      await act(async () => {
        await result.current.pickRecoverySecret();
      });
      await act(async () => {
        await result.current.restoreFromFiles();
      });

      expect(AppNavigation.toDashboard).toHaveBeenCalledTimes(1);
      expect(completeEncryptedRestoreLaunch).toHaveBeenCalledTimes(firstRun ? 1 : 0);
      expect(setWorkplaceId).toHaveBeenCalledTimes(firstRun ? 0 : 1);
      expect(result.current.hasImportedBackup).toBe(false);
      expect(result.current.hasImportedSecret).toBe(false);
      if (hasWarning) {
        expect(alert.show).toHaveBeenCalledWith(
          expect.objectContaining({
            type: 'warning',
            message: expect.stringContaining('balances'),
          }),
        );
      } else {
        expect(alert.show).not.toHaveBeenCalled();
      }
    },
  );

  it.each(['blur', 'lock', 'clear'] as const)(
    'suppresses activation, navigation and warnings after %s during restore',
    async interruption => {
      let finish!: (
        value: Awaited<ReturnType<typeof encryptedRestoreWorkflow.restoreSelectedBackup>>,
      ) => void;
      const pending = new Promise<
        Awaited<ReturnType<typeof encryptedRestoreWorkflow.restoreSelectedBackup>>
      >(resolve => {
        finish = resolve;
      });
      jest.mocked(encryptedRestoreWorkflow.restoreSelectedBackup).mockReturnValueOnce(pending);
      const setWorkplaceId = jest.fn();
      jest.mocked(useOptionalWorkplace).mockReturnValue({
        workplaceId: asWorkplaceId('existing-workplace'),
        defaultCurrencyCode: 'INR',
        setWorkplaceId,
        deleteWorkplace: jest.fn(),
      });
      const { result, unmount, rerender } = renderHook(() => usePrivateBackup());
      await act(async () => {
        await result.current.pickBackup();
      });
      await act(async () => {
        await result.current.pickRecoverySecret();
      });
      let restoring!: Promise<void>;
      act(() => {
        restoring = result.current.restoreFromFiles();
      });
      const call = jest.mocked(encryptedRestoreWorkflow.restoreSelectedBackup).mock.calls[0][0];
      if (interruption === 'blur') unmount();
      else if (interruption === 'lock') {
        jest
          .mocked(useAppLock)
          .mockReturnValue({ isAppCurrentlyLocked: true } as ReturnType<typeof useAppLock>);
        rerender({});
      } else
        act(() => {
          result.current.clearRestoreInputs();
        });
      expect(call.signal?.aborted).toBe(true);
      await act(async () => {
        finish({
          status: 'ready',
          identity: { userId: 'user', registeredDeviceId: 'device', userKeyFingerprint: 'pin' },
          workplace: { id: 'workplace' } as Workplace,
          manifestHash: 'manifest',
          rowCount: 1,
          warnings: ['balance warning'],
        });
        await restoring;
      });
      expect(setWorkplaceId).not.toHaveBeenCalled();
      expect(completeEncryptedRestoreLaunch).not.toHaveBeenCalled();
      expect(AppNavigation.toDashboard).not.toHaveBeenCalled();
      expect(alert.show).not.toHaveBeenCalled();
      if (interruption === 'clear') {
        expect(result.current.hasImportedBackup).toBe(false);
        expect(result.current.hasImportedSecret).toBe(false);
        expect(encryptedRestoreWorkflow.prepareRecoveryAttempt).toHaveBeenCalledTimes(1);
      }
    },
  );

  it('clears selections and permits selecting the same files for another attempt', async () => {
    const { result } = renderHook(() => usePrivateBackup());
    await act(async () => {
      await result.current.pickBackup();
    });
    await act(async () => {
      await result.current.pickRecoverySecret();
    });
    act(() => {
      result.current.clearRestoreInputs();
    });
    expect(result.current.hasImportedBackup).toBe(false);
    expect(result.current.hasImportedSecret).toBe(false);
    await act(async () => {
      await result.current.pickBackup();
    });
    await act(async () => {
      await result.current.pickRecoverySecret();
    });
    expect(result.current.hasImportedBackup).toBe(true);
    expect(result.current.hasImportedSecret).toBe(true);
    expect(encryptedRestoreWorkflow.prepareRecoveryAttempt).toHaveBeenCalledTimes(2);
    expect(encryptedRestoreWorkflow.restoreSelectedBackup).not.toHaveBeenCalled();
  });

  it('re-enables actions when a native file picker resolves during an app background transition', async () => {
    let resolvePicker!: (value: Uint8Array | null) => void;
    let changeState!: (state: string) => void;
    (AppState.addEventListener as jest.Mock) = jest.fn((_event, handler) => {
      changeState = handler;
      return { remove: jest.fn() };
    });
    jest.mocked(encryptedBackupFiles.pickEncryptedBackupZip).mockReturnValueOnce(
      new Promise(resolve => {
        resolvePicker = resolve;
      }),
    );
    const { result } = renderHook(() => usePrivateBackup());
    await act(async () => undefined);

    let picking!: Promise<void>;
    act(() => {
      picking = result.current.pickBackup();
    });
    expect(result.current.disabled).toBe(true);

    AppState.currentState = 'background';
    await act(async () => {
      resolvePicker(new Uint8Array([1]));
      await Promise.resolve();
    });
    AppState.currentState = 'active';
    await act(async () => {
      changeState('active');
      await picking;
    });

    expect(result.current.hasImportedBackup).toBe(true);
    expect(result.current.disabled).toBe(false);
  });

  it('waits for foreground before verifying a recovery file returned by the native picker', async () => {
    let resolvePicker!: (value: unknown | null) => void;
    let changeState!: (state: string) => void;
    (AppState.addEventListener as jest.Mock) = jest.fn((_event, handler) => {
      changeState = handler;
      return { remove: jest.fn() };
    });
    jest.mocked(recoveryFiles.pickSecret).mockReturnValueOnce(
      new Promise(resolve => {
        resolvePicker = resolve;
      }),
    );
    const { result } = renderHook(() => usePrivateBackup());
    await act(async () => undefined);

    let verifying!: Promise<void>;
    act(() => {
      verifying = result.current.verifySecret();
    });
    AppState.currentState = 'background';
    await act(async () => {
      resolvePicker({ format: 'full-frills-recovery-handle' });
      await Promise.resolve();
    });

    expect(encryptionSetup.confirmUser).not.toHaveBeenCalled();
    expect(result.current.disabled).toBe(true);

    await act(async () => {
      AppState.currentState = 'active';
      changeState('active');
      await verifying;
    });

    expect(encryptionSetup.confirmUser).toHaveBeenCalledTimes(1);
    expect(result.current.disabled).toBe(false);
  });
});
