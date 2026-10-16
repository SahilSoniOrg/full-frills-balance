import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { usePrivateBackup } from '../usePrivateBackup';
import { encryptedBackupFiles } from '@/src/services/backup/encryptedBackupFiles';
import { recoveryFiles } from '@/src/services/backup/recoveryFiles';
import { restoreEncryptedBackupZip } from '@/src/services/sync/encryptedBackupActions';
import { alert } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { database } from '@/src/data/database/Database';
import Workplace from '@/src/data/models/Workplace';
import { encryptionSetup } from '@/src/services/backup/encryptionSetup';
import { loadPendingEncryptedRestoreDeviceId } from '@/src/services/backup/pendingEncryptedRestoreDeviceId';
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
  useAppLock: () => ({ isAppCurrentlyLocked: false }),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({ useOptionalWorkplace: () => null }));
jest.mock('@/src/services/backup/encryptionSetup', () => ({
  encryptionSetup: { inspect: jest.fn().mockResolvedValue({ session: null, keys: null }) },
}));
jest.mock('@/src/services/backup/encryptionSetupStore', () => ({
  encryptionSetupStore: { saveSession: jest.fn().mockResolvedValue(undefined) },
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
jest.mock('@/src/services/backup/keyAccessPolicy', () => ({ assertKeyAccessAllowed: jest.fn() }));
jest.mock('@/src/services/backup/cryptoProvider', () => ({ cryptoProvider: {} }));
jest.mock('@/src/services/sync/encryptedBackupActions', () => ({
  restoreEncryptedBackupZip: jest.fn(),
}));
jest.mock('@/src/services/backup/pendingEncryptedRestoreDeviceId', () => ({
  loadPendingEncryptedRestoreDeviceId: jest.fn().mockResolvedValue('device'),
  clearPendingEncryptedRestoreDeviceId: jest.fn().mockResolvedValue(undefined),
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
    jest.mocked(restoreEncryptedBackupZip).mockResolvedValue({
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
    expect(restoreEncryptedBackupZip).toHaveBeenCalledWith(new Uint8Array([1]), {
      mode: 'existing',
      identity,
    });
    expect(recoveryFiles.pickSecret).not.toHaveBeenCalled();
    expect(loadPendingEncryptedRestoreDeviceId).not.toHaveBeenCalled();
    expect(AppNavigation.toDashboard).toHaveBeenCalledTimes(1);
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
      const workplace = database.get<Workplace>('workplaces').prepareCreate(record => {
        record.name = 'Restored books';
        record.icon = 'briefcase';
        record.defaultCurrencyCode = 'INR';
      });
      jest.mocked(restoreEncryptedBackupZip).mockResolvedValue({
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
});
