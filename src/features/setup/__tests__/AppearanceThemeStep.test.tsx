import { fireEvent, render, screen, waitFor } from '@/src/utils/test-utils';
import { AppearanceThemeStep } from '../AppearanceThemeStep';
import type { ReactNode } from 'react';

jest.mock('@/src/components/core', () => {
  const { Text, TouchableOpacity, View } = jest.requireActual(
    'react-native',
  ) as typeof import('react-native');
  return {
    AppButton: ({ children, ...props }: { children: ReactNode }) => (
      <TouchableOpacity {...props}>
        <Text>{children}</Text>
      </TouchableOpacity>
    ),
    AppCard: ({ children, ...props }: { children: ReactNode }) => (
      <View {...props}>{children}</View>
    ),
    AppIcon: () => null,
    AppText: ({ children, ...props }: { children: ReactNode }) => (
      <Text {...props}>{children}</Text>
    ),
  };
});

jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({ theme: { primary: '#00aa77', textSecondary: '#777', border: '#ddd' } }),
}));
jest.mock('@/src/hooks/useThemePrefs', () => ({
  useThemePrefs: () => ({
    themeId: 'deep-space',
    fontId: 'deep-space',
    setThemeId: jest.fn(),
    setFontId: jest.fn(),
  }),
}));
jest.mock('../SetupStsPreview', () => ({
  SetupStsPreview: () => null,
}));

describe('AppearanceThemeStep', () => {
  it('reports theme and font selections to the onboarding draft', async () => {
    const onThemeChange = jest.fn();
    const onFontChange = jest.fn();

    render(
      <AppearanceThemeStep
        currencyCode="USD"
        themeId="deep-space"
        fontId="deep-space"
        onThemeChange={onThemeChange}
        onFontChange={onFontChange}
        onContinue={jest.fn()}
        onBack={jest.fn()}
        isCompleting={false}
      />,
    );

    expect(screen.getByRole('button', { name: 'Previous theme, Editorial' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Next theme, Gold Obsidian' })).toBeTruthy();
    fireEvent.press(screen.getByTestId('onboarding-theme-next-button'));
    fireEvent.press(screen.getByTestId('onboarding-font-editorial-option'));

    expect(onThemeChange).toHaveBeenCalledWith('gold-obsidian');
    await waitFor(() => expect(onFontChange).toHaveBeenCalledWith('editorial'));
  });
});
