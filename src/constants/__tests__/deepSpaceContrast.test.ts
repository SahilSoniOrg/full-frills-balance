import { getThemeColors, ThemeIds, type Theme } from '../design-tokens';
import { getContrastRatio, getLuminance } from '@/src/utils/color-math';

const ratio = (foreground: string, background: string) =>
  getContrastRatio(getLuminance(foreground), getLuminance(background));

// Deep Space is the signature look; both modes must read cleanly at the token level.
// Components may still add `getReadableColor`, but tokens should not need it.
const TEXT_ROLES = [
  'text',
  'textSecondary',
  'textTertiary',
  'primary',
  'success',
  'warning',
  'error',
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
  'transfer',
] as const satisfies readonly (keyof Theme)[];

const SURFACES = [
  'background',
  'surface',
  'surfaceSecondary',
] as const satisfies readonly (keyof Theme)[];

// Semantic ink drawn on its own soft tint (badges, toasts, chips, calculator keys).
const TINT_PAIRS = [
  ['primary', 'primaryLight'],
  ['success', 'successLight'],
  ['error', 'errorLight'],
  ['warning', 'warningLight'],
  ['asset', 'assetLight'],
] as const satisfies readonly (readonly [keyof Theme, keyof Theme])[];

describe.each(['light', 'dark'] as const)('Deep Space %s contrast', mode => {
  const theme = getThemeColors(ThemeIds.DEEP_SPACE, mode);

  it.each(TEXT_ROLES.flatMap(role => SURFACES.map(surface => [role, surface] as const)))(
    '%s on %s meets 4.5:1',
    (role, surface) => {
      expect(ratio(theme[role], theme[surface])).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(TINT_PAIRS)('%s on %s meets 4.5:1', (ink, tint) => {
    expect(ratio(theme[ink], theme[tint])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps onPrimary readable on primary fills', () => {
    expect(ratio(theme.onPrimary, theme.primary)).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps soft tints on the same side of the ramp as the surface', () => {
    // Light tints must be pale fills, not dark patches on a light page (and vice versa).
    for (const [, tint] of TINT_PAIRS) {
      if (mode === 'light') expect(getLuminance(theme[tint])).toBeGreaterThan(0.7);
      else expect(getLuminance(theme[tint])).toBeLessThan(0.1);
    }
  });
});
