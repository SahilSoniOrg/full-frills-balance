import {
  anonymizedIdentityKind,
  ensureAnonymizedIdForKind,
  formatAnonymizedId,
  type AnonymizedIdentitySignals,
} from '../anonymizedIdentity';

const productionDevice: AnonymizedIdentitySignals = {
  isE2eHarness: false,
  isDevRuntime: false,
  appVariant: 'production',
  isNativeSimulator: false,
};

describe('anonymizedIdentityKind', () => {
  it('gives each non-prod install its own prefix kind', () => {
    expect(anonymizedIdentityKind({ ...productionDevice, isE2eHarness: true })).toBe('e2e');
    expect(anonymizedIdentityKind({ ...productionDevice, isDevRuntime: true })).toBe('dev');
    expect(anonymizedIdentityKind({ ...productionDevice, appVariant: 'development' })).toBe('dev');
    expect(anonymizedIdentityKind({ ...productionDevice, appVariant: 'preview' })).toBe('preview');
    expect(anonymizedIdentityKind({ ...productionDevice, isNativeSimulator: true })).toBe('sim');
    expect(anonymizedIdentityKind(productionDevice)).toBe('anon');
  });

  it('prefers E2E over dev, preview, and simulator', () => {
    expect(
      anonymizedIdentityKind({
        isE2eHarness: true,
        isDevRuntime: true,
        appVariant: 'preview',
        isNativeSimulator: true,
      }),
    ).toBe('e2e');
  });
});

describe('formatAnonymizedId', () => {
  it('prefixes entropy so store users stay on the historical anon_ shape', () => {
    expect(formatAnonymizedId('anon', 'entropy')).toBe('anon_entropy');
    expect(formatAnonymizedId('e2e', 'entropy')).toBe('e2e_entropy');
    expect(formatAnonymizedId('dev', 'entropy')).toBe('dev_entropy');
    expect(formatAnonymizedId('preview', 'entropy')).toBe('preview_entropy');
    expect(formatAnonymizedId('sim', 'entropy')).toBe('sim_entropy');
  });
});

describe('ensureAnonymizedIdForKind', () => {
  it('keeps an id that already matches this install kind', () => {
    expect(ensureAnonymizedIdForKind('preview_abc', 'preview', 'new')).toBe('preview_abc');
  });

  it('never remints a production install that already has an id', () => {
    expect(ensureAnonymizedIdForKind('legacy-unprefixed', 'anon', 'new')).toBe('legacy-unprefixed');
  });

  it('remints a production-shaped id on a non-prod install', () => {
    expect(ensureAnonymizedIdForKind('anon_old', 'e2e', 'new')).toBe('e2e_new');
    expect(ensureAnonymizedIdForKind('anon_old', 'dev', 'new')).toBe('dev_new');
    expect(ensureAnonymizedIdForKind(undefined, 'preview', 'new')).toBe('preview_new');
  });
});
