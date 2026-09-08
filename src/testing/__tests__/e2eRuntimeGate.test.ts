import Constants from 'expo-constants';
import { assertE2eHarnessEnabled, isE2eHarnessEnabled } from '../e2eRuntimeGate';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

describe('E2E runtime gate', () => {
  const originalE2eFlag = process.env.EXPO_PUBLIC_E2E;

  beforeEach(() => {
    process.env.EXPO_PUBLIC_E2E = '0';
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {};
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
});
