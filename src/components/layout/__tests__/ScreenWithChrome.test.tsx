import {
  PersistentTabChromeProvider,
  PersistentTabLeaf,
  usePersistentTabChrome,
} from '@/src/components/layout/PersistentTabChrome';
import { NavigationBar } from '@/src/components/layout/NavigationBar';
import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import {
  SelectionHeader,
  type SelectionOverlayProps,
} from '@/src/components/shared/SelectionOverlay';
import { getSelectionState } from '@/src/hooks/selectionState';
import type { ScreenChrome } from '@/src/components/layout/screenChrome';
import { Icon } from '@/src/types/domainIcons';
import { render, screen } from '@/src/testing/render';
import { StyleSheet, Text } from 'react-native';
import { Screen } from '@/src/components/layout/Screen';
import { Page } from '@/src/design-system/Page';
import { SafeAreaFrame } from '@/src/design-system/SafeArea';
import { SelectionActionBar } from '@/src/components/shared/SelectionActionBar';
import { SelectionSummary } from '@/src/components/shared/SelectionSummary';
import {
  SelectionFooterHost,
  SelectionHeaderHost,
} from '@/src/components/shared/SelectionChromeHost';
import {
  PrimaryNavigationProvider,
  primaryTabFromRouteName,
  type PrimaryNavigationContextValue,
} from '@/src/navigation/primaryNavigation';
import { RoutePresentationProvider } from '@/src/navigation/RoutePresentationContext';

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
      onBack: jest.fn(),
    };

    render(
      <ScreenWithChrome chrome={chrome}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );

    expect(screen.UNSAFE_getByType(SafeAreaFrame).props.edges).toEqual([
      'top',
      'bottom',
      'left',
      'right',
    ]);
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

    expect(screen.UNSAFE_getByType(SafeAreaFrame).props.edges).toEqual(['top', 'left', 'right']);
  });

  it('preserves explicitly configured edges', () => {
    const chrome: ScreenChrome = {
      screenTitle: 'Custom',
      kind: 'nav',
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

describe('ScreenWithChrome back icon', () => {
  const nav: ScreenChrome = { kind: 'nav', screenTitle: 'Screen', onBack: jest.fn() };
  const backIcon = () => screen.UNSAFE_getByType(Screen).props.left?.icon;

  it.each([
    ['composer', Icon.Close],
    ['detail', Icon.Back],
  ] as const)('follows the %s route presentation', (presentation, expected) => {
    render(
      <RoutePresentationProvider presentation={presentation}>
        <ScreenWithChrome chrome={nav}>
          <Text>Content</Text>
        </ScreenWithChrome>
      </RoutePresentationProvider>,
    );
    expect(backIcon()).toBe(expected);
  });

  it('lets an in-screen step override the route icon', () => {
    render(
      <RoutePresentationProvider presentation="composer">
        <ScreenWithChrome chrome={{ ...nav, backIcon: Icon.Back }}>
          <Text>Content</Text>
        </ScreenWithChrome>
      </RoutePresentationProvider>,
    );
    expect(backIcon()).toBe(Icon.Back);
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

describe('ScreenWithChrome primary header', () => {
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

describe('ScreenWithChrome selection overlay', () => {
  const selection: SelectionOverlayProps = {
    state: getSelectionState(new Set(['journal']), ['journal']),
    itemTypeLabel: 'transaction',
    selectAll: jest.fn(),
    clearItems: jest.fn(),
    exitSelectionMode: jest.fn(),
  };
  it('keeps the navigation bar mounted when selection appears', () => {
    const chrome: ScreenChrome = {
      kind: 'nav',
      screenTitle: 'Details',
      onBack: jest.fn(),
    };
    const view = (selecting: boolean) => (
      <ScreenWithChrome
        chrome={{
          ...chrome,
          selection: selecting ? selection : undefined,
        }}
      >
        <Text>Content</Text>
      </ScreenWithChrome>
    );

    const { rerender } = render(view(false));
    const navigationBar = screen.UNSAFE_getByType(NavigationBar);

    rerender(view(true));
    expect(screen.UNSAFE_getByType(NavigationBar)).toBe(navigationBar);
    expect(screen.getByText('1 of 1 transaction selected')).toBeTruthy();
    expect(screen.UNSAFE_getByType(NavigationBar).props.covered).toBe(true);
    expect(screen.UNSAFE_getByType(Screen).props.left?.onPress).toBe(chrome.onBack);

    rerender(view(false));
    expect(screen.UNSAFE_getByType(NavigationBar)).toBe(navigationBar);
    expect(screen.queryByText('1 of 1 transaction selected')).toBeNull();
    expect(screen.UNSAFE_getByType(NavigationBar).props.covered).toBe(false);
    expect(screen.UNSAFE_getByType(Screen).props.left?.onPress).toBe(chrome.onBack);
  });

  it('mounts selection summary and action dock in Page header and footer slots instead of an overlay', () => {
    const chrome: ScreenChrome = {
      kind: 'nav',
      screenTitle: 'Details',
      onBack: jest.fn(),
      selection: {
        ...selection,
        actions: [
          {
            name: Icon.Share,
            label: 'Share',
            onPress: jest.fn(),
          },
        ],
      },
    };

    render(
      <ScreenWithChrome chrome={chrome}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );

    const page = screen.UNSAFE_getByType(Page);
    expect(page.props.header).toBeTruthy();
    expect(page.props.footer).toBeTruthy();
    expect(screen.UNSAFE_getByType(SelectionHeaderHost)).toBeTruthy();
    expect(screen.UNSAFE_getByType(SelectionFooterHost)).toBeTruthy();
    expect(screen.UNSAFE_getByType(SelectionSummary)).toBeTruthy();
    expect(screen.UNSAFE_getByType(SelectionActionBar)).toBeTruthy();

    const navBarWrapper = screen.UNSAFE_getByType(NavigationBar).parent;
    expect(StyleSheet.flatten(navBarWrapper?.props.style)).toMatchObject({
      position: 'absolute',
    });
  });

  it('publishes a retained leaf overlay only under that leaf’s route', () => {
    const activityChrome: ScreenChrome = {
      kind: 'tab',
      screenTitle: 'Activity',
      selection,
    };

    function ActiveOverlay({ routeName }: { routeName: string }) {
      const activeSelection = usePersistentTabChrome(routeName)?.selection;
      return activeSelection ? <SelectionHeader {...activeSelection} /> : null;
    }

    const view = (routeName: string) => (
      <PersistentTabChromeProvider>
        <ActiveOverlay routeName={routeName} />
        <PersistentTabLeaf routeName="activity">
          <ScreenWithChrome chrome={activityChrome}>
            <Text>Activity content</Text>
          </ScreenWithChrome>
        </PersistentTabLeaf>
      </PersistentTabChromeProvider>
    );
    const { rerender } = render(view('activity'));
    expect(screen.getByText('1 of 1 transaction selected')).toBeTruthy();

    rerender(view('accounts'));
    expect(screen.getByText('Activity content')).toBeTruthy();
    expect(screen.queryByText('1 of 1 transaction selected')).toBeNull();
  });

  it('omits the action dock when selection has no actions and hides the covered nav bar', () => {
    const chrome: ScreenChrome = {
      kind: 'nav',
      screenTitle: 'Details',
      onBack: jest.fn(),
      selection: {
        ...selection,
        actions: [],
      },
    };

    render(
      <ScreenWithChrome chrome={chrome}>
        <Text>Content</Text>
      </ScreenWithChrome>,
    );

    expect(screen.UNSAFE_queryByType(SelectionActionBar)).toBeNull();
    const navBarWrapper = screen.UNSAFE_getByType(NavigationBar).parent;
    expect(navBarWrapper?.props['aria-hidden']).toBe(true);
    expect(StyleSheet.flatten(navBarWrapper?.props.style)).toMatchObject({ opacity: 0 });
  });
});
