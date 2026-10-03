import { AccountType } from '@/src/types/enums';
import { getThemeColors, ThemeIds } from '@/src/constants/design-tokens';
import { getContrastRatio, getLuminance } from '@/src/utils/color-math';
import { getVariantColors } from '@/src/utils/style-helpers';
import {
  countAccountsVsCategories,
  isValidHexColor,
  resolveAccountAccentColor,
  resolveAccountAppearance,
} from '@/src/utils/accountCategory';

const mockTheme = {
  asset: '#10B981',
  liability: '#F59E0B',
  equity: '#8B5CF6',
  income: '#3B82F6',
  expense: '#EF4444',
  text: '#1F2937',
} as any;

describe('accountCategory color utilities', () => {
  describe('isValidHexColor', () => {
    it('returns true for valid 6-digit hex strings', () => {
      expect(isValidHexColor('#7DD3A8')).toBe(true);
      expect(isValidHexColor('#F87171')).toBe(true);
      expect(isValidHexColor('#000000')).toBe(true);
      expect(isValidHexColor('#FFFFFF')).toBe(true);
    });

    it('returns false for invalid hex inputs', () => {
      expect(isValidHexColor('')).toBe(false);
      expect(isValidHexColor(null)).toBe(false);
      expect(isValidHexColor(undefined)).toBe(false);
      expect(isValidHexColor('#FFF')).toBe(false); // 3-digit hex
      expect(isValidHexColor('7DD3A8')).toBe(false); // missing #
      expect(isValidHexColor('javascript:alert(1)')).toBe(false);
      expect(isValidHexColor('#12345G')).toBe(false); // invalid hex char
    });
  });

  describe('resolveAccountAccentColor', () => {
    it('returns custom hex color when valid', () => {
      const account = { accountType: AccountType.ASSET, color: '#3B82F6' };
      expect(resolveAccountAccentColor(account, mockTheme)).toBe('#3B82F6');
    });

    it('falls back to account type accent color when custom color is empty or invalid', () => {
      const autoAccount = { accountType: AccountType.ASSET, color: '' };
      expect(resolveAccountAccentColor(autoAccount, mockTheme)).toBe('#10B981');

      const invalidAccount = { accountType: AccountType.EXPENSE, color: 'invalid-hex' };
      expect(resolveAccountAccentColor(invalidAccount, mockTheme)).toBe('#EF4444');
    });
  });

  describe('resolveAccountAppearance', () => {
    it('keeps category color stable while applying a custom accent', () => {
      const appearance = resolveAccountAppearance(
        { accountType: AccountType.ASSET, color: '#3B82F6' },
        mockTheme,
      );

      expect(appearance).toEqual({
        accentColor: '#3B82F6',
        categoryColor: '#10B981',
      });
    });

    it.each(Object.values(ThemeIds))(
      'resolves readable account accents and stable type colors in both %s appearances',
      themeId => {
        for (const mode of ['light', 'dark'] as const) {
          const theme = getThemeColors(themeId, mode);
          for (const accountType of [
            'asset',
            'liability',
            'income',
            'expense',
            'equity',
          ] as const) {
            const background = getVariantColors(theme, () => theme.text, accountType).light;
            const original = resolveAccountAppearance({ accountType }, theme);
            for (const color of [undefined, '', 'bad-color', '#C99AFF', background]) {
              const appearance = resolveAccountAppearance(
                { accountType, color },
                theme,
                background,
              );
              expect(appearance.categoryColor).toBe(original.categoryColor);
              expect(
                getContrastRatio(getLuminance(appearance.accentColor), getLuminance(background)),
              ).toBeGreaterThanOrEqual(4.5);
            }
          }
        }
      },
    );

    it('preserves a readable saved account color when a text background is supplied', () => {
      const theme = getThemeColors(ThemeIds.DEEP_SPACE, 'dark');
      expect(
        resolveAccountAppearance(
          { accountType: AccountType.ASSET, color: '#C99AFF' },
          theme,
          theme.assetLight,
        ).accentColor,
      ).toBe('#C99AFF');
    });
  });

  describe('countAccountsVsCategories', () => {
    it('splits income and expense rows out of the account count', () => {
      expect(
        countAccountsVsCategories([
          { accountType: AccountType.ASSET },
          { accountType: AccountType.LIABILITY },
          { accountType: AccountType.EQUITY },
          { accountType: AccountType.INCOME },
          { accountType: 'EXPENSE' },
        ]),
      ).toEqual({ accounts: 3, categories: 2 });
    });
  });
});
