import { AppSafeAreaProvider } from '@/src/design-system/SafeArea';
import { TabsLayout } from '@/src/features/app/TabsLayout';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';
import type { PrimaryNavigationContextValue } from '@/src/navigation/primaryNavigation';

let mockBottomInset = 24;
let mockKeyboardVisible = false;
const mockNavigateToTab = jest.fn();
const mockEmit = jest.fn(() => ({ defaultPrevented: false }));
const mockNavigation: {
  current?: PrimaryNavigationContextValue;
  focus?: (routeName: string) => void;
} = {};

jest.mock('expo-router', () => {
  const { Fragment } = jest.requireActual<typeof import('react')>('react');
  const tabsMock = ({
    tabBar,
    children,
    screenListeners,
  }: {
    tabBar: (props: unknown) => ReactNode;
    children: ReactNode;
    screenListeners:
      { focus: () => void } | ((props: { route: { name: string } }) => { focus: () => void });
  }) => {
    mockNavigation.focus = name => {
      const listeners =
        typeof screenListeners === 'function'
          ? screenListeners({ route: { name } })
          : screenListeners;
      listeners.focus();
    };
    return (
      <Fragment>
        {children}
        {tabBar({
          state: {
            index: 0,
            routes: ['index', 'accounts', 'commitments', 'activity'].map(name => ({
              name,
              key: name,
            })),
          },
          emitter: { emit: mockEmit },
          navigateToTab: mockNavigateToTab,
        })}
      </Fragment>
    );
  };
  tabsMock.Screen = function screenMock() {
    return null;
  };
  return { Tabs: tabsMock, useRouter: () => ({ push: jest.fn() }) };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 24, right: 0, bottom: mockBottomInset, left: 0 }),
}));
jest.mock('@/src/design-system/Keyboard', () => ({
  useKeyboard: () => ({ isKeyboardVisible: mockKeyboardVisible }),
}));
jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    workplaceId: 'home',
    activeWorkplace: { id: 'home', name: 'Home', icon: 'briefcase' },
    isSwitchingWorkplace: false,
    workplaceSwitchError: null,
    setWorkplaceId: jest.fn(),
  }),
  useOptionalWorkplace: () => undefined,
}));
jest.mock('@/src/hooks/useObservable', () => ({ useObservable: () => ({ data: [] }) }));
jest.mock('@/src/hooks/useProfilePrefs', () => ({ useProfilePrefs: () => ({ userName: 'Test' }) }));
jest.mock('@/src/services/WorkplaceService', () => ({ workplaceService: {} }));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: {} }));
// Deep jest.mock paths are required so PrimaryTabBar’s relative ContextualAddMenu
// import is stubbed; avoid `import('…/deep')` type refs — those fail the boundary check.
jest.mock('@/src/features/navigation/ContextualAddMenu', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    ContextualAddMenu: ({ disabled }: { disabled: boolean }) =>
      createElement(View, { testID: 'contextual-add', accessibilityState: { disabled } }),
  };
});
jest.mock('@/src/features/navigation/NavigationDrawer', () => ({
  NavigationDrawer: ({ children }: { children: unknown }) => children,
}));
jest.mock('@/src/navigation/primaryNavigation', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const actual = jest.requireActual<typeof import('@/src/navigation/primaryNavigation')>(
    '@/src/navigation/primaryNavigation',
  );
  return {
    ...actual,
    PrimaryNavigationProvider: (props: { value: PrimaryNavigationContextValue }) => {
      mockNavigation.current = props.value;
      return createElement(actual.PrimaryNavigationProvider, props);
    },
  };
});
jest.mock('@/src/components/core', () => {
  const { Text, Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    AppText: Text,
    AppIcon: () => null,
    PressScaleTouchable: Pressable,
    Icon: jest.requireActual<typeof import('@/src/types/domainIcons')>('@/src/types/domainIcons')
      .Icon,
  };
});
jest.mock('@/src/hooks/use-theme', () => ({
  useTheme: () => ({
    theme: {
      background: '#f7f7f7',
      primary: '#00aa77',
      primaryLight: '#e3f5ec',
      onPrimary: '#ffffff',
      text: '#111111',
      textSecondary: '#666666',
      surface: '#ffffff',
      surfaceSecondary: '#eeeeee',
      border: '#dddddd',
      overlay: 'rgba(0, 0, 0, 0.4)',
    },
  }),
}));

function renderTabs() {
  return render(
    <AppSafeAreaProvider>
      <TabsLayout />
    </AppSafeAreaProvider>,
  );
}

describe('primary navigation', () => {
  beforeEach(() => {
    mockBottomInset = 24;
    mockKeyboardVisible = false;
    jest.clearAllMocks();
  });

  it('renders four destinations and the contextual Add action', () => {
    renderTabs();
    expect(screen.getAllByRole('tab')).toHaveLength(4);
    expect(screen.getByTestId('contextual-add')).toBeTruthy();
    fireEvent.press(screen.getByTestId('tab-accounts'));
    expect(mockEmit).toHaveBeenCalledWith({
      type: 'tabPress',
      target: 'accounts',
      canPreventDefault: true,
    });
    expect(mockNavigateToTab).toHaveBeenCalledWith('accounts');
  });

  it.each([0, 24, 34, 48])('owns the bottom safe area exactly once (%s)', bottom => {
    mockBottomInset = bottom;
    renderTabs();
    const bar = screen.getByTestId('primary-tab-bar');
    expect(StyleSheet.flatten(bar.props.style as ViewProps['style'])?.paddingBottom).toBe(bottom);
  });

  it('hides the custom tab bar while the keyboard is open', () => {
    const { rerender } = renderTabs();
    mockKeyboardVisible = true;
    rerender(
      <AppSafeAreaProvider>
        <TabsLayout />
      </AppSafeAreaProvider>,
    );
    expect(screen.queryByTestId('primary-tab-bar')).toBeNull();
    expect(screen.queryByTestId('contextual-add')).toBeNull();
  });

  it('keeps Add available in selection mode and clears selection on tab focus', () => {
    renderTabs();
    act(() => mockNavigation.current?.reportSelectionMode(true));
    expect(mockNavigation.current?.selectionModeActive).toBe(true);
    expect(screen.getByTestId('contextual-add').props.accessibilityState.disabled).toBe(false);
    act(() => mockNavigation.focus?.('index'));
    expect(mockNavigation.current?.selectionModeActive).toBe(false);
  });
});
