import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { Platform } from 'react-native';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import { SharingProvider } from '@/src/contexts/SharingContext';
import { SharingRuntime } from '@/src/services/sharing/SharingRuntime';
import { PlatformShareTransport } from '@/src/services/sharing/ShareTransport';
import { ShareFormat } from '@/src/types/sharing';
import { confirm } from '@/src/utils/alerts';
import { useDataExportViewModel } from '../useDataExportViewModel';

jest.mock('@/src/services/SharingService', () => ({
  sharingRuntime: null,
  FileSharingUnavailableError: class extends Error {},
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({ workplaceId: 'home' }),
}));
jest.mock('@/src/hooks/useObservable', () => ({
  useObservable: () => ({ data: [{ id: 'home', name: 'Home' }] }),
}));
jest.mock('@/src/hooks/useSharePrefs', () => ({
  useSharePrefs: () => ({ defaultShareFormat: 'ZIP' }),
}));
jest.mock('@/src/services/WorkplaceService', () => ({ workplaceService: {} }));
jest.mock('@/src/services/analytics', () => ({
  analytics: { track: jest.fn(), trackFeatureUsage: jest.fn() },
}));
jest.mock('@/src/services/export/nativeBackupExporter', () => ({
  exportWorkplacesToJSON: jest.fn(async () => 'backup-bytes'),
}));
jest.mock('@/src/utils/alerts', () => ({
  confirm: { show: jest.fn() },
  toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn(), info: jest.fn() },
}));
jest.mock('@/src/utils/files', () => ({
  files: {
    document: 'file:///documents/',
    writeContent: jest.fn(async (uri: string) => uri),
    deleteFile: jest.fn(async () => {}),
  },
}));
jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: jest.fn(),
    createFileAsync: jest.fn(),
  },
}));

afterEach(() => jest.restoreAllMocks());

it.each(['saved', 'cancelled', 'failed'] as const)(
  'hides the native progress modal before the Android %s confirmation while retaining ownership',
  async flow => {
    jest.replaceProperty(Platform, 'OS', 'android');
    jest.mocked(confirm.show).mockClear();
    jest
      .mocked(StorageAccessFramework.requestDirectoryPermissionsAsync)
      .mockResolvedValue(
        flow === 'cancelled'
          ? { granted: false }
          : { granted: true, directoryUri: 'content://exports' },
      );
    const createFile = jest.mocked(StorageAccessFramework.createFileAsync);
    if (flow === 'failed') createFile.mockRejectedValueOnce(new Error('Disk full'));
    else createFile.mockResolvedValueOnce('content://exports/backup.zip');

    const runtime = new SharingRuntime(new PlatformShareTransport());
    const wrapper = ({ children }: { children: ReactNode }) => (
      <SharingProvider runtime={runtime}>{children}</SharingProvider>
    );
    const viewModel = renderHook(() => useDataExportViewModel(), { wrapper });
    let operation!: Promise<void>;
    await act(async () => {
      viewModel.result.current.setIsNamingExport(true);
    });
    expect(viewModel.result.current.isNamingExport).toBe(true);
    await act(async () => {
      operation = Promise.resolve(viewModel.result.current.onConfirmExport());
    });
    await waitFor(() => expect(confirm.show).toHaveBeenCalledTimes(1));
    expect(runtime.getSnapshot().phase).toBe('awaiting-user');
    expect(viewModel.result.current.isNamingExport).toBe(false);
    expect(viewModel.result.current.isExporting).toBe(true);
    expect(viewModel.result.current.isPreparingExport).toBe(false);
    await expect(
      runtime.execute(
        {
          id: 'competitor',
          title: 'Other export',
          filename: 'other',
          scope: { kind: 'device' },
          supportedFormats: [],
          prepare: jest.fn(),
        },
        { action: 'share', format: ShareFormat.ZIP },
      ),
    ).resolves.toEqual({ kind: 'busy' });

    await act(async () => {
      const options = jest.mocked(confirm.show).mock.calls[0][0];
      if (flow === 'saved') options.onCancel?.();
      else options.onClose?.();
      await operation;
    });
    expect(runtime.getSnapshot().phase).toBe('idle');
    expect(viewModel.result.current.isExporting).toBe(false);
    expect(viewModel.result.current.isPreparingExport).toBe(false);
  },
);
