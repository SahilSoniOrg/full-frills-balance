import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { readAppVariant } from '../appVariant';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: { expoConfig: { extra: {} } },
}));

jest.mock('expo-application', () => ({
  applicationId: 'in.sahilsoni.fullfrillsbalance',
}));

describe('readAppVariant', () => {
  const originalPublicVariant = process.env.EXPO_PUBLIC_APP_VARIANT;
  const originalVariant = process.env.APP_VARIANT;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_APP_VARIANT;
    delete process.env.APP_VARIANT;
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {};
    (Application as { applicationId: string | null }).applicationId =
      'in.sahilsoni.fullfrillsbalance';
  });

  afterAll(() => {
    if (originalPublicVariant === undefined) {
      delete process.env.EXPO_PUBLIC_APP_VARIANT;
    } else {
      process.env.EXPO_PUBLIC_APP_VARIANT = originalPublicVariant;
    }
    if (originalVariant === undefined) {
      delete process.env.APP_VARIANT;
    } else {
      process.env.APP_VARIANT = originalVariant;
    }
  });

  it('prefers the baked Expo extra over env and application id', () => {
    (Constants.expoConfig as { extra: Record<string, unknown> }).extra = {
      appVariant: 'preview',
    };
    process.env.APP_VARIANT = 'development';
    (Application as { applicationId: string | null }).applicationId =
      'in.sahilsoni.fullfrillsbalance.dev';

    expect(readAppVariant()).toBe('preview');
  });

  it('infers development and preview from the application id', () => {
    (Application as { applicationId: string | null }).applicationId =
      'in.sahilsoni.fullfrillsbalance.dev';
    expect(readAppVariant()).toBe('development');

    (Application as { applicationId: string | null }).applicationId =
      'in.sahilsoni.fullfrillsbalance.preview';
    expect(readAppVariant()).toBe('preview');
  });

  it('defaults unknown installs to production', () => {
    expect(readAppVariant()).toBe('production');
  });
});
