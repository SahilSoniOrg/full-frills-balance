import { AppConfig } from '@/src/constants/app-config';
import { preferences } from '@/src/services/preferences';
import {
  acknowledgeCurrentPrivacyPolicy,
  formatPrivacyPolicyEffectiveDate,
  hasAcknowledgedCurrentPrivacyPolicy,
  readPrivacyPolicyAcknowledgement,
} from '@/src/services/legal/privacyPolicyAcceptance';

jest.mock('@/src/utils/storage', () => {
  const memory = new Map<string, string>();
  return {
    storage: {
      getString: jest.fn((key: string) => memory.get(key)),
      set: jest.fn((key: string, value: string) => memory.set(key, value)),
      remove: jest.fn((key: string) => memory.delete(key)),
    },
  };
});

describe('privacy policy acknowledgement', () => {
  beforeEach(() => {
    preferences.privacy.clearPrivacyPolicyAcknowledgement();
  });

  it('accepts only the current policy version', () => {
    preferences.privacy.setPrivacyPolicyAcknowledgement({
      version: AppConfig.legal.privacyPolicyVersion,
      acknowledgedAt: '2026-09-07T00:00:00.000Z',
    });

    expect(hasAcknowledgedCurrentPrivacyPolicy()).toBe(true);

    preferences.privacy.setPrivacyPolicyAcknowledgement({
      version: '2026-03-05',
      acknowledgedAt: '2026-03-05T00:00:00.000Z',
    });

    expect(hasAcknowledgedCurrentPrivacyPolicy()).toBe(false);
  });

  it('fails closed for missing or malformed records', () => {
    expect(readPrivacyPolicyAcknowledgement()).toBeUndefined();

    preferences.privacy.clearPrivacyPolicyAcknowledgement();
    expect(readPrivacyPolicyAcknowledgement()).toBeUndefined();
  });

  it('formats the effective date from the policy version', () => {
    expect(formatPrivacyPolicyEffectiveDate('2026-09-07')).toBe('September 7, 2026');
    expect(formatPrivacyPolicyEffectiveDate('invalid')).toBe('invalid');
  });

  it('writes the current version and acknowledgement timestamp', () => {
    acknowledgeCurrentPrivacyPolicy(new Date('2026-09-07T12:34:56.000Z'));

    expect(readPrivacyPolicyAcknowledgement()).toEqual({
      version: AppConfig.legal.privacyPolicyVersion,
      acknowledgedAt: '2026-09-07T12:34:56.000Z',
    });
    expect(preferences.device.getSnapshot()).not.toHaveProperty('privacyPolicyAcknowledgement');
  });
});
