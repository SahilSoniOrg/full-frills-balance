import { hasRawDeviceBag } from '../migrateLegacyPreferences';

describe('Device-bag provenance', () => {
  it('reports raw absence before migration synthesizes defaults', () => {
    expect(hasRawDeviceBag(undefined)).toBe(false);
    expect(hasRawDeviceBag('')).toBe(true);
    expect(hasRawDeviceBag(JSON.stringify({ onboardingCompleted: false }))).toBe(true);
  });
});
