import type { CheckOptions, StatusUpdateEvent } from 'sp-react-native-in-app-updates';
import { ANDROID_APPLICATION_ID, PlayInstallStatus } from '../playUpdateTypes';

const mockApp = { applicationId: ANDROID_APPLICATION_ID, nativeBuildVersion: '160' };
const mockConstants = { executionEnvironment: 'bare' };
const mockStatusListener = jest.fn();
const mockResultListener = jest.fn();
const mockCheck = jest.fn(async (_options?: CheckOptions) => ({
  shouldUpdate: true,
  other: {
    versionCode: 161,
    updateAvailability: 2,
    installStatus: 0,
    isImmediateUpdateAllowed: true,
    isFlexibleUpdateAllowed: true,
  },
}));
const mockClient = {
  checkNeedsUpdate: mockCheck,
  startUpdate: jest.fn(async () => {}),
  installUpdate: jest.fn(async () => {}),
  dispose: jest.fn(),
  addStatusUpdateListener: mockStatusListener,
  addIntentSelectionListener: mockResultListener,
};
const mockConstructor = jest.fn(() => mockClient);

jest.mock('expo-application', () => mockApp);
jest.mock('expo-constants', () => ({ __esModule: true, default: mockConstants }));
jest.mock('react-native', () => ({ Platform: { OS: 'android' } }));
jest.mock('sp-react-native-in-app-updates', () => ({ __esModule: true, default: mockConstructor }));

describe('Android Play adapter', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    mockApp.applicationId = ANDROID_APPLICATION_ID;
    mockApp.nativeBuildVersion = '160';
    mockConstants.executionEnvironment = 'bare';
    mockCheck.mockResolvedValue({
      shouldUpdate: true,
      other: {
        versionCode: 161,
        updateAvailability: 2,
        installStatus: 0,
        isImmediateUpdateAllowed: true,
        isFlexibleUpdateAllowed: true,
      },
    });
  });

  it.each([
    'in.sahilsoni.fullfrillsbalance.dev',
    'in.sahilsoni.fullfrillsbalance.preview',
    'unknown',
  ])('does not load the native library for %s', async id => {
    mockApp.applicationId = id;
    const { playUpdateService } = jest.requireActual<typeof import('../playUpdateService.android')>(
      '../playUpdateService.android',
    );
    expect(await playUpdateService.check()).toBeNull();
    expect(mockConstructor).not.toHaveBeenCalled();
  });

  it.each(['160bad', '-1', '', '1.0.0'])(
    'rejects invalid installed build %s before native loading',
    async build => {
      mockApp.nativeBuildVersion = build;
      const { playUpdateService } = jest.requireActual<
        typeof import('../playUpdateService.android')
      >('../playUpdateService.android');
      expect(await playUpdateService.check()).toBeNull();
      expect(mockConstructor).not.toHaveBeenCalled();
    },
  );

  it('does not load the enforcing TurboModule in Expo Go', async () => {
    mockConstants.executionEnvironment = 'storeClient';
    const { playUpdateService } = jest.requireActual<typeof import('../playUpdateService.android')>(
      '../playUpdateService.android',
    );
    expect(await playUpdateService.check()).toBeNull();
  });

  it('compares native builds numerically and recovers downloaded status', async () => {
    const { playUpdateService } = jest.requireActual<typeof import('../playUpdateService.android')>(
      '../playUpdateService.android',
    );
    mockCheck.mockResolvedValue({
      shouldUpdate: true,
      other: {
        versionCode: 161,
        updateAvailability: 2,
        installStatus: 11,
        isImmediateUpdateAllowed: true,
        isFlexibleUpdateAllowed: true,
      },
    });
    expect(await playUpdateService.check()).toMatchObject({
      build: 161,
      installStatus: PlayInstallStatus.Downloaded,
    });
    const options = mockCheck.mock.calls[0][0];
    expect(options?.curVersion).toBe('160');
    expect(options?.customVersionComparator?.('161', '160')).toBe(1);
    expect(options?.customVersionComparator?.('159', '160')).toBe(-1);
    expect(() => options?.customVersionComparator?.('1.0.0', '160')).toThrow();
  });

  it('uses one client, normalizes progress, distinguishes acceptance from installation and tears down listeners', async () => {
    const { playUpdateService } = jest.requireActual<typeof import('../playUpdateService.android')>(
      '../playUpdateService.android',
    );
    const emit = jest.fn();
    const unsubscribe = playUpdateService.subscribe(emit);
    await playUpdateService.check();
    await playUpdateService.check();
    expect(mockConstructor).toHaveBeenCalledTimes(1);
    const status: (event: StatusUpdateEvent) => void = mockStatusListener.mock.calls[0][0];
    status({ status: 2, bytesDownloaded: '50', totalBytesToDownload: '100' });
    expect(emit).toHaveBeenLastCalledWith({ kind: 'status', status: 2, progress: 0.5 });
    status({ status: 2, bytesDownloaded: 'nan', totalBytesToDownload: '0' });
    expect(emit).toHaveBeenLastCalledWith({ kind: 'status', status: 2, progress: undefined });
    const result: (value: number) => void = mockResultListener.mock.calls[0][0];
    result(4);
    expect(emit).toHaveBeenLastCalledWith({ kind: 'accepted' });
    expect(mockClient.installUpdate).not.toHaveBeenCalled();
    result(5);
    expect(emit).toHaveBeenLastCalledWith({ kind: 'status', status: PlayInstallStatus.Failed });
    unsubscribe();
    await Promise.resolve();
    expect(mockClient.dispose).toHaveBeenCalledTimes(1);
  });
});
