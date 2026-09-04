import { ThemeIds } from '@/src/constants/design-tokens';
import { ThemeOverride } from '@/src/contexts/UIContext';
import { useTheme } from '@/src/hooks/use-theme';
import { renderHook } from '@testing-library/react-native';
import type { ReactNode } from 'react';

jest.mock('@/src/hooks/useThemePrefs', () => ({
  useThemePrefs: () => ({
    themeMode: 'light',
    themeId: 'deep-space',
    fontId: 'deep-space',
    themePreference: 'light',
    setThemePreference: jest.fn(),
    setThemeId: jest.fn(),
    setFontId: jest.fn(),
  }),
}));

describe('useTheme appearance override', () => {
  it('demos a setup theme without writing persisted prefs', () => {
    const persisted = renderHook(() => useTheme());
    const previewed = renderHook(() => useTheme(), {
      wrapper: ({ children }: { children: ReactNode }) => (
        <ThemeOverride themeId={ThemeIds.IVY}>{children}</ThemeOverride>
      ),
    });

    expect(persisted.result.current.themeId).toBe(ThemeIds.DEEP_SPACE);
    expect(previewed.result.current.themeId).toBe(ThemeIds.IVY);
    expect(previewed.result.current.theme.primary).not.toBe(persisted.result.current.theme.primary);
  });
});
