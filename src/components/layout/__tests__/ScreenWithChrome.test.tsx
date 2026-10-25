import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';
import { Icon } from '@/src/types/domainIcons';
import { render, screen } from '@/src/utils/test-utils';
import { Text } from 'react-native';
import { Screen } from '@/src/components/layout/Screen';
import { SafeAreaFrame } from '@/src/design-system/SafeArea';
import {
  PrimaryNavigationProvider,
  primaryTabFromRouteName,
  type PrimaryNavigationContextValue,
} from '@/src/navigation/primaryNavigation';

jest.mock('@/src/components/layout/NavigationBar', () => ({
  NavigationBar: () => null,
}));

jest.mock('@/src/navigation/PrimaryNavigationHeader', () => ({
  PrimaryNavigationHeader: () => null,
}));

jest.mock('expo-router', () => ({
  useIsFocused: () => true,
}));

function navigationValue(
  overrides: Partial<PrimaryNavigationContextValue> = {},
): PrimaryNavigationContextValue {
  return {
    reportSelectionMode: jest.fn(),
    selectionModeActive: false,
    drawerVisible: false,
    openDrawer: jest.fn(),
    closeDrawer: jest.fn(),
    userName: 'Test',
    ...overrides,
  };
}

describe('ScreenWithChrome safe-area ownership', () => {
  it('applies the bottom safe area to pushed screens', () => {
    const chrome: ScreenChrome = {
      screenTitle: 'Details',
      kind: 'nav',
      backIcon: Icon.Back,
      onBack: jest.fn(),
    };

    render(
      <ScreenWithChrome chrome={chrome}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );

    expect(screen.UNSAFE_getByType(SafeAreaFrame).props.edges).toEqual(['top', 'bottom']);
  });

  it('leaves the bottom safe area to the tab bar on tab roots', () => {
    const chrome: ScreenChrome = {
      screenTitle: 'Dashboard',
      kind: 'tab',
    };

    render(
      <ScreenWithChrome chrome={chrome}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );

    expect(screen.UNSAFE_getByType(SafeAreaFrame).props.edges).toEqual(['top']);
  });

  it('preserves explicitly configured edges', () => {
    const chrome: ScreenChrome = {
      screenTitle: 'Custom',
      kind: 'nav',
      backIcon: Icon.Back,
      onBack: jest.fn(),
    };

    render(
      <ScreenWithChrome chrome={chrome} edges={['top', 'left']}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );

    expect(screen.UNSAFE_getByType(SafeAreaFrame).props.edges).toEqual(['top', 'left']);
  });
});

describe('primaryTabFromRouteName', () => {
  it.each([
    ['index', 'dashboard'],
    ['accounts', 'accounts'],
    ['commitments', 'commitments'],
    ['activity', 'activity'],
    ['hub', undefined],
    ['journal-entry', undefined],
  ])('maps %s to %s', (name, expected) => {
    expect(primaryTabFromRouteName(name)).toBe(expected);
  });
});

describe('ScreenWithChrome navigation reporting', () => {
  it('does not re-report selection mode when unrelated navigation context changes', () => {
    const reportSelectionMode = jest.fn();
    const renderRoot = (drawerVisible: boolean) => (
      <PrimaryNavigationProvider value={navigationValue({ reportSelectionMode, drawerVisible })}>
        <ScreenWithChrome chrome={{ kind: 'tab', screenTitle: 'Accounts' }}>
          <Text>Content</Text>
        </ScreenWithChrome>
      </PrimaryNavigationProvider>
    );

    const { rerender } = render(renderRoot(false));
    expect(reportSelectionMode).toHaveBeenCalledTimes(1);

    rerender(renderRoot(true));
    expect(reportSelectionMode).toHaveBeenCalledTimes(1);
  });

  it('keeps the primary header while the shell drawer state changes', () => {
    const navigation = navigationValue();
    const outgoingTab = (drawerVisible: boolean) => (
      <PrimaryNavigationProvider value={{ ...navigation, drawerVisible }}>
        <ScreenWithChrome chrome={{ kind: 'tab', screenTitle: 'Accounts' }}>
          <Text>Outgoing tab</Text>
        </ScreenWithChrome>
      </PrimaryNavigationProvider>
    );
    const { rerender } = render(outgoingTab(false));
    expect(screen.UNSAFE_getByType(Screen).props.left?.kind).toBe('leading');
    rerender(outgoingTab(true));
    expect(screen.UNSAFE_getByType(Screen).props.left?.kind).toBe('leading');
    expect(navigation.reportSelectionMode).toHaveBeenLastCalledWith(false);
  });

  it('does not render a leading slot outside the primary navigation provider', () => {
    render(
      <ScreenWithChrome chrome={{ kind: 'tab', screenTitle: 'Accounts' }}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );
    expect(screen.UNSAFE_getByType(Screen).props.left).toBeUndefined();
  });
});
