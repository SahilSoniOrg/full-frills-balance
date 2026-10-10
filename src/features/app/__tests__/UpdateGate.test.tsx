/* eslint-disable @typescript-eslint/no-require-imports -- Jest factories require isolated native stubs. */
import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { AppUpdateSnapshot } from '@/src/services/update/appUpdateService';
import { updateInsightService } from '@/src/services/update/updateInsightService';
import { toast } from '@/src/utils/alerts';
import { UpdateGate } from '../UpdateGate';

let mockSnapshot: AppUpdateSnapshot;
const mockListeners = new Set<() => void>();
const mockUpdate = jest.fn(async () => {});
const mockCheck = jest.fn(async () => {});
jest.mock('@/src/services/update/appUpdateService', () => ({
  appUpdateService: {
    getSnapshot: () => mockSnapshot,
    subscribe: (listener: () => void) => {
      mockListeners.add(listener);
      return () => mockListeners.delete(listener);
    },
    connect: () => () => {},
    check: () => mockCheck(),
    update: () => mockUpdate(),
  },
}));
jest.mock('@/src/services/update/updateInsightService', () => ({
  updateInsightService: {
    publishAvailableUpdate: jest.fn(),
    dismissAvailableUpdate: jest.fn(),
    clearAvailableUpdate: jest.fn(),
    isNoticeDismissed: jest.fn(() => false),
  },
}));
jest.mock('@/src/utils/alerts', () => ({ toast: { info: jest.fn(), error: jest.fn() } }));
jest.mock('@/src/hooks/use-theme', () => ({ useTheme: () => ({ theme: {} }) }));
jest.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ bottom: 0 }) }));
jest.mock('@/src/hooks/useObservable', () => ({ useObservable: () => ({ data: [] }) }));
jest.mock('@/src/services/WorkplaceService', () => ({ workplaceService: {} }));
jest.mock('@/src/services/preferences', () => ({ preferences: { device: {} } }));
jest.mock('@/src/services/export', () => ({ exportUpdateBackup: jest.fn() }));
jest.mock('@/src/features/app/BackupScopeSheet', () => ({ BackupScopeSheet: () => null }));
jest.mock('@/src/components/overlays/ModalSurface', () => ({ ModalSurface: () => null }));
jest.mock('@/src/design-system', () => {
  const { View } = require('react-native');
  return { Box: View, Stack: View };
});
jest.mock('@/src/components/core', () => {
  const { Text, View, Pressable } = require('react-native');
  return {
    Icon: {},
    AppText: Text,
    AppCard: View,
    AppIcon: () => null,
    IconTile: () => null,
    AppButton: ({
      children,
      onPress,
      testID,
      disabled,
    }: {
      children?: React.ReactNode;
      onPress?: () => void;
      testID?: string;
      disabled?: boolean;
    }) => (
      <Pressable testID={testID} onPress={onPress} disabled={disabled}>
        <Text>{children}</Text>
      </Pressable>
    ),
  };
});

const notice = { minimumBuild: 159, latestBuild: 161, storeUrl: 'https://example.com/store' };
function publish(patch: Partial<AppUpdateSnapshot>) {
  act(() => {
    mockSnapshot = { ...mockSnapshot, ...patch };
    mockListeners.forEach(listener => listener());
  });
}

describe('UpdateGate presentation', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockSnapshot = { access: 'allowed', phase: 'idle' };
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('routes the optional prompt through the shared update action and does not repeat it on refresh', () => {
    mockSnapshot.notice = notice;
    const screen = render(
      <UpdateGate>
        <Text>Books</Text>
      </UpdateGate>,
    );
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(screen.getByText('Books')).toBeTruthy();
    expect(toast.info).toHaveBeenCalledTimes(1);
    const options = jest.mocked(toast.info).mock.calls[0][1];
    options?.action?.onPress();
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    publish({ notice: { ...notice } });
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(toast.info).toHaveBeenCalledTimes(1);
  });

  it('honors persisted dismissal while leaving the update in Hub', () => {
    jest.mocked(updateInsightService.isNoticeDismissed).mockReturnValueOnce(true);
    mockSnapshot.notice = notice;
    render(
      <UpdateGate>
        <Text>Books</Text>
      </UpdateGate>,
    );
    act(() => {
      jest.runOnlyPendingTimers();
    });
    expect(toast.info).not.toHaveBeenCalled();
    expect(updateInsightService.publishAvailableUpdate).toHaveBeenCalledWith(notice, false);
  });

  it('uses the same toast key when an available update becomes ready', () => {
    mockSnapshot.notice = notice;
    render(
      <UpdateGate>
        <Text>Books</Text>
      </UpdateGate>,
    );
    act(() => {
      jest.runOnlyPendingTimers();
    });
    publish({ phase: 'downloaded' });
    act(() => {
      jest.runOnlyPendingTimers();
    });
    const calls = jest.mocked(toast.info).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]?.key).toBe('app-update');
    expect(calls[1][1]?.key).toBe('app-update');
    expect(calls[1][1]?.action?.label).toBe('Restart to update');
  });

  it('shows progress without removing the books, then supports restart and Later', () => {
    const screen = render(
      <UpdateGate>
        <Text>Books</Text>
      </UpdateGate>,
    );
    publish({ notice, phase: 'downloading', progress: 0.5 });
    expect(screen.getByText('Books')).toBeTruthy();
    expect(screen.getByText('Downloading update… 50%')).toBeTruthy();
    publish({ phase: 'downloaded', progress: 1 });
    fireEvent.press(screen.getByTestId('update-restart'));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Later'));
    expect(screen.queryByTestId('update-download-status')).toBeNull();
    expect(updateInsightService.dismissAvailableUpdate).toHaveBeenCalledWith(notice, true);
    publish({ notice: { ...notice } });
    expect(screen.queryByTestId('update-download-status')).toBeNull();
  });

  it('retains required-update backup and retry actions while showing download status', () => {
    mockSnapshot = { access: 'required', policy: notice, phase: 'downloading', progress: 0.25 };
    const screen = render(
      <UpdateGate>
        <Text>Books</Text>
      </UpdateGate>,
    );
    expect(screen.queryByText('Books')).toBeNull();
    expect(screen.getByTestId('update-export-backup')).toBeTruthy();
    expect(screen.getByText('Downloading update… 25%')).toBeTruthy();
    publish({ phase: 'idle' });
    fireEvent.press(screen.getByTestId('update-now'));
    expect(mockUpdate).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByText('Check again'));
    expect(mockCheck).toHaveBeenCalled();
  });
});
