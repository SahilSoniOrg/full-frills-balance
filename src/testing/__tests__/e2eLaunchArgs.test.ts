import Constants from 'expo-constants';
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

  beforeEach(() => {
    valueMock.mockReset();
    process.env.EXPO_PUBLIC_E2E = '0';
    (Constants.expoConfig as { extra?: Record<string, unknown> }).extra = {};
  });

  afterAll(() => {
    if (originalE2eFlag === undefined) {
      delete process.env.EXPO_PUBLIC_E2E;
    } else {
      process.env.EXPO_PUBLIC_E2E = originalE2eFlag;
    }
  });

  it('ignores valid launch arguments when the production gate is off', () => {
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {
      e2eHarnessEnabled: true,
    };
    valueMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eSeedProfile: 'onboarded',
    });
    expect(readE2eLaunchConfig()).toBeNull();
  });

  it('returns null without auth token in an enabled E2E build', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {
      e2eHarnessEnabled: true,
    };
    valueMock.mockReturnValue({ e2eSeedProfile: 'onboarded' });
    expect(readE2eLaunchConfig()).toBeNull();
  });

  it('parses seed profile when both gates and auth are present', () => {
    process.env.EXPO_PUBLIC_E2E = '1';
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {
      e2eHarnessEnabled: true,
    };
    valueMock.mockReturnValue({
      e2eAuth: E2E_AUTH_TOKEN,
      e2eSeedProfile: 'journal-ready',
    });
    expect(readE2eLaunchConfig()).toEqual({
      reset: true,
      seedProfile: 'journal-ready',
    });
  });
});
