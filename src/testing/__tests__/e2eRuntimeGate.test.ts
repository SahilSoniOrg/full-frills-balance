import Constants from 'expo-constants';
import { E2E_AUTH_TOKEN } from '../e2eConstants';
import { assertE2eHarnessEnabled, isE2eHarnessEnabled, isE2eOfflineMode } from '../e2eRuntimeGate';
import { LaunchArguments } from 'react-native-launch-arguments';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock('react-native-launch-arguments', () => ({
  LaunchArguments: {
    value: jest.fn(() => ({})),
  },
}));

describe('E2E runtime gate', () => {
  const originalE2eFlag = process.env.EXPO_PUBLIC_E2E;
  const launchArgsMock = LaunchArguments.value as jest.Mock;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_E2E = '0';
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {};
    launchArgsMock.mockReturnValue({});
  });

  afterAll(() => {
    if (originalE2eFlag === undefined) {
      delete process.env.EXPO_PUBLIC_E2E;
    } else {
      process.env.EXPO_PUBLIC_E2E = originalE2eFlag;
    }
  });

  it('requires both the build flag and Expo capability', () => {
    expect(isE2eHarnessEnabled()).toBe(false);

    process.env.EXPO_PUBLIC_E2E = '1';
    expect(isE2eHarnessEnabled()).toBe(false);

    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {
      e2eHarnessEnabled: true,
    };
    expect(isE2eHarnessEnabled()).toBe(true);
  });

  it('fails closed when a destructive boundary is called without capability', () => {
    expect(() => assertE2eHarnessEnabled()).toThrow('Harness capability is disabled');
  });

  it('stays online when only the E2E build flag is set (no Detox launch)', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {
      e2eHarnessEnabled: true,
    };
    expect(isE2eOfflineMode()).toBe(false);
  });

  it('goes offline when an authenticated E2E launch config is present', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {
      e2eHarnessEnabled: true,
    };
    launchArgsMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eReset: '1',
      e2eSeedProfile: 'onboarded',
    });
    expect(isE2eOfflineMode()).toBe(true);
  });
});
