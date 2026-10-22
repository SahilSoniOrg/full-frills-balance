import { act, renderHook } from '@testing-library/react-native';
import { BehaviorSubject } from 'rxjs';
import { usePendingRestoreCompletion } from '../usePendingRestoreCompletion';
import { encryptedRestoreCompletion } from '@/src/services/backup/encryptedRestoreCompletion';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { completeEncryptedRestoreLaunch } from '@/src/features/setup';
import { asWorkplaceId } from '@/src/types/ids';
import type { PendingRestoreCompletion } from '@/src/data/repositories/RestoreCompletionRepository';

jest.mock('@/src/services/backup/encryptedRestoreCompletion', () => ({
  encryptedRestoreCompletion: {
    observePending: jest.fn(),
    resume: jest.fn(),
    retryCleanup: jest.fn(),
  },
}));
jest.mock('@/src/contexts/app-shell/AppLockProvider', () => ({ useAppLock: jest.fn() }));
jest.mock('@/src/features/setup', () => ({ completeEncryptedRestoreLaunch: jest.fn() }));

const pending = { workplaceId: asWorkplaceId('workplace'), manifestHash: 'receipt', json: '{}' };
let changes: BehaviorSubject<PendingRestoreCompletion[]>;
const lock = (locked: boolean) =>
  jest.mocked(useAppLock).mockReturnValue({
    isAppCurrentlyLocked: locked,
    isAppActive: true,
  } as ReturnType<typeof useAppLock>);

beforeEach(() => {
  jest.clearAllMocks();
  changes = new BehaviorSubject<PendingRestoreCompletion[]>([pending]);
  jest.mocked(encryptedRestoreCompletion.observePending).mockReturnValue(changes);
  jest.mocked(encryptedRestoreCompletion.resume).mockImplementation(async onReady => {
    await onReady(pending.workplaceId);
    changes.next([]);
  });
  lock(false);
});

it('waits for unlock and then resumes without mounting a file-selection screen', async () => {
  lock(true);
  const { result, rerender } = renderHook(() => usePendingRestoreCompletion(true, 0));
  await act(async () => undefined);
  expect(result.current.active).toBe(true);
  expect(encryptedRestoreCompletion.resume).not.toHaveBeenCalled();
  lock(false);
  await act(async () => rerender({}));
  expect(completeEncryptedRestoreLaunch).toHaveBeenCalledWith(pending.workplaceId);
  expect(result.current.active).toBe(false);
});

it('holds the gate during acknowledgement even if the in-memory query is already empty', async () => {
  let finish!: () => void;
  const acknowledgement = new Promise<void>(resolve => {
    finish = resolve;
  });
  jest.mocked(encryptedRestoreCompletion.resume).mockImplementationOnce(async () => {
    changes.next([]);
    await acknowledgement;
  });
  const { result } = renderHook(() => usePendingRestoreCompletion(true, 0));
  await act(async () => undefined);
  expect(result.current.active).toBe(true);
  await act(async () => finish());
  expect(result.current.active).toBe(false);
});

it('requires an explicit retry after completion failure instead of looping', async () => {
  jest
    .mocked(encryptedRestoreCompletion.resume)
    .mockRejectedValueOnce(new Error('storage unavailable'));
  const { result, rerender } = renderHook(
    ({ retry }: { retry: number }) => usePendingRestoreCompletion(true, retry),
    {
      initialProps: { retry: 0 },
    },
  );
  await act(async () => undefined);
  expect(result.current.error?.message).toBe('storage unavailable');
  expect(result.current.active).toBe(true);
  expect(encryptedRestoreCompletion.resume).toHaveBeenCalledTimes(1);
  await act(async () => rerender({ retry: 1 }));
  expect(encryptedRestoreCompletion.resume).toHaveBeenCalledTimes(2);
  expect(result.current.active).toBe(false);
});
