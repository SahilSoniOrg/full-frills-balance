import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { LaunchArguments } from 'react-native-launch-arguments';
import { E2E_AUTH_TOKEN } from '../e2eConstants';
import { readE2eLaunchConfig } from '../e2eLaunchArgs';

jest.mock('react-native-launch-arguments', () => ({
  LaunchArguments: {
    value: jest.fn(),
  },
}));

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

describe('readE2eLaunchConfig', () => {
  const valueMock = LaunchArguments.value as jest.Mock;
  const originalE2eFlag = process.env.EXPO_PUBLIC_E2E;
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  beforeEach(() => {
    valueMock.mockReset();
    process.env.EXPO_PUBLIC_E2E = '0';
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {
      e2eHarnessEnabled: true,
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });

  function browserLaunch(query: string): void {
    jest.replaceProperty(Platform, 'OS', 'web');
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: { location: { href: `http://localhost/?${query}` } },
    });
  }

  it('reads authenticated browser seed arguments without calling the native module', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    browserLaunch(`e2eAuth=${E2E_AUTH_TOKEN}&e2eSeedProfile=picker-ready&e2eReset=1`);
    expect(readE2eLaunchConfig()).toEqual({ reset: true, seedProfile: 'picker-ready' });
    expect(valueMock).not.toHaveBeenCalled();
  });

  it('ignores browser seed arguments in a production build', () => {
    browserLaunch(`e2eAuth=${E2E_AUTH_TOKEN}&e2eSeedProfile=onboarded`);
    expect(readE2eLaunchConfig()).toBeNull();
    expect(valueMock).not.toHaveBeenCalled();
  });

  it('requires the build capability even when the browser has auth and the E2E flag', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {};
    browserLaunch(`e2eAuth=${E2E_AUTH_TOKEN}&e2eSeedProfile=onboarded`);
    expect(readE2eLaunchConfig()).toBeNull();
  });

  it('rejects browser seed arguments without authentication', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    browserLaunch('e2eSeedProfile=onboarded&e2eReset=1');
    expect(readE2eLaunchConfig()).toBeNull();
  });

  afterAll(() => {
    if (originalE2eFlag === undefined) {
      delete process.env.EXPO_PUBLIC_E2E;
    } else {
      process.env.EXPO_PUBLIC_E2E = originalE2eFlag;
    }
  });

  it('ignores valid launch arguments when the production gate is off', () => {
    valueMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eSeedProfile: 'onboarded',
    });
    expect(readE2eLaunchConfig()).toBeNull();
  });

  it('returns null without auth token in an enabled E2E build', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    valueMock.mockReturnValue({ e2eSeedProfile: 'onboarded' });
    expect(readE2eLaunchConfig()).toBeNull();
  });

  it('parses seed profile when both gates and auth are present', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    valueMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eSeedProfile: 'journal-ready',
    });
    expect(readE2eLaunchConfig()).toEqual({
      reset: true,
      seedProfile: 'journal-ready',
    });
  });

  it('parses an update-gate mode only with the authenticated E2E launch', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    valueMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eUpdateGateMode: 'required',
    });

    expect(readE2eLaunchConfig()).toEqual({ reset: false, updateGateMode: 'required' });
  });

  it('ignores an unknown update-gate mode', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    valueMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eUpdateGateMode: 'skip',
    });

    expect(readE2eLaunchConfig()).toEqual({ reset: false });
  });

  it('accepts update transport fixtures only in an authenticated E2E build', () => {
    valueMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eUpdateGateMode: 'available',
      e2eUpdateFlow: 'download',
    });
    expect(readE2eLaunchConfig()).toBeNull();
    process.env.EXPO_PUBLIC_E2E = '1';
    expect(readE2eLaunchConfig()).toEqual({
      reset: false,
      updateGateMode: 'available',
      updateFlow: 'download',
    });
    valueMock.mockReturnValue({ e2eAuth: 'wrong', e2eUpdateFlow: 'download' });
    expect(readE2eLaunchConfig()).toBeNull();
  });

  it('accepts the native recovery proof only behind build capability and launch authentication', () => {
    valueMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eRecoveryAction: 'recover',
      e2eRecoveryBundlePath: '/local/disposable-proof.json',
    });
    expect(readE2eLaunchConfig()).toBeNull();
    process.env.EXPO_PUBLIC_E2E = '1';
    expect(readE2eLaunchConfig()).toEqual({
      reset: false,
      recoveryAction: 'recover',
      recoveryBundlePath: '/local/disposable-proof.json',
    });
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {
      e2eHarnessEnabled: false,
    };
    expect(readE2eLaunchConfig()).toBeNull();
  });

  it('ignores unknown recovery actions', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    valueMock.mockReturnValue({ e2eAuth: E2E_AUTH_TOKEN, e2eRecoveryAction: 'wipe-user-books' });
    expect(readE2eLaunchConfig()).toEqual({ reset: false });
  });
});
