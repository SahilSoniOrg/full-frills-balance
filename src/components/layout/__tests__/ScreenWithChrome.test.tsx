import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';
import { render, screen } from '@/src/utils/test-utils';
import { Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

jest.mock('@/src/components/layout/NavigationBar', () => ({
  NavigationBar: () => null,
}));

describe('ScreenWithChrome safe-area ownership', () => {
  it('applies the bottom safe area to pushed screens', () => {
    const chrome: ScreenChrome = {
      screenTitle: 'Details',
      showBack: true,
      onBack: jest.fn(),
    };

    render(
      <ScreenWithChrome chrome={chrome}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );

    expect(screen.UNSAFE_getByType(SafeAreaView).props.edges).toEqual(['top', 'bottom']);
  });

  it('leaves the bottom safe area to the tab bar on tab roots', () => {
    const chrome: ScreenChrome = {
      screenTitle: 'Dashboard',
      showBack: false,
    };

    render(
      <ScreenWithChrome chrome={chrome}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );

    expect(screen.UNSAFE_getByType(SafeAreaView).props.edges).toEqual(['top']);
  });

  it('preserves explicitly configured edges', () => {
    const chrome: ScreenChrome = {
      screenTitle: 'Custom',
      showBack: true,
      onBack: jest.fn(),
    };

    render(
      <ScreenWithChrome chrome={chrome} edges={['top', 'left']}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );

    expect(screen.UNSAFE_getByType(SafeAreaView).props.edges).toEqual(['top', 'left']);
  });
});
