import { ScreenWithChrome } from '@/src/components/layout/ScreenWithChrome';
import { SelectionActionBar } from '@/src/components/shared/SelectionActionBar';
import { SelectionSummary } from '@/src/components/shared/SelectionSummary';
import { SafeAreaFrame } from '@/src/design-system/SafeArea';
import { createPrimaryPagerContent } from '@/src/features/navigation/PrimaryPagerNavigator.shared';
import type { PrimaryPagerViewportProps } from '@/src/features/navigation/PrimaryPagerViewport.types';
import { PrimaryTabBar } from '@/src/features/navigation/PrimaryTabBar';
import { HomeV2Header } from '@/src/features/navigation/HomeV2Header';
import { getSelectionState } from '@/src/hooks/selectionState';
import { PRIMARY_PAGES } from '@/src/navigation/primaryPages';
import { Icon } from '@/src/types/domainIcons';
import { render, screen } from '@/src/testing/render';
import { BackHandler, StyleSheet, Text, View } from 'react-native';

const mockReportSelectionMode = jest.fn();

jest.mock('expo-router', () => ({
  unstable_useReconcileTabHistory: () => {},
  useIsFocused: () => true,
}));

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    workplaceId: 'home',
    activeWorkplace: { id: 'home', name: 'Home', icon: 'briefcase' },
    isSwitchingWorkplace: false,
  }),
  useOptionalWorkplace: () => undefined,
}));

jest.mock('@/src/features/accounts', () => ({
  AccountsGroupProvider: ({ children }: { children: React.ReactNode }) => children,
}));

jest.mock('@/src/navigation/PrimaryNavigationHeader', () => ({
  PrimaryNavigationHeader: () => null,
}));

jest.mock('@/src/features/navigation/ContextualAddMenu', () => ({
  ContextualAddMenu: () => null,
}));

jest.mock('@/src/navigation/primaryNavigation', () => {
  const actual = jest.requireActual<typeof import('@/src/navigation/primaryNavigation')>(
    '@/src/navigation/primaryNavigation',
  );
  return {
    ...actual,
    usePrimaryNavigation: () => ({
      reportSelectionMode: mockReportSelectionMode,
      selectionModeActive: false,
      drawerVisible: false,
      openDrawer: jest.fn(),
      closeDrawer: jest.fn(),
      userName: 'Test',
      reportActiveRoute: jest.fn(),
    }),
    useReportDrawerSwipePermission: () => {},
    useHasMultipleWorkplaces: () => false,
  };
});

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

function MockViewport({ pages, committedIndex }: PrimaryPagerViewportProps) {
  return <View testID="pager-viewport">{pages[committedIndex]?.render()}</View>;
}

const PagerContent = createPrimaryPagerContent(MockViewport);

function renderPager(
  selecting: boolean,
  options?: {
    index?: number;
    navigate?: jest.Mock;
    exitSelectionMode?: jest.Mock;
  },
) {
  const routes = PRIMARY_PAGES.map(page => ({ key: page.routeName, name: page.routeName }));
  const descriptors = Object.fromEntries(
    routes.map(route => [
      route.key,
      {
        render: () => (
          <ScreenWithChrome
            chrome={{
              kind: 'tab',
              screenTitle: 'Accounts',
              selection: selecting
                ? {
                    state: getSelectionState(new Set(['a1', 'l1']), ['a1', 'l1']),
                    itemTypeLabel: 'account',
                    amountSummary: {
                      label: 'Direct balances',
                      sections: [
                        {
                          label: 'Assets',
                          colorKey: 'asset',
                          amounts: [{ amount: 500, currencyCode: 'USD' }],
                        },
                        {
                          label: 'Liabilities',
                          colorKey: 'liability',
                          amounts: [{ amount: 120, currencyCode: 'EUR' }],
                        },
                      ],
                    },
                    exitSelectionMode: options?.exitSelectionMode ?? jest.fn(),
                    selectAll: jest.fn(),
                    clearItems: jest.fn(),
                    actions: [
                      {
                        name: Icon.Share,
                        label: 'Share',
                        onPress: jest.fn(),
                        isPrimary: true,
                      },
                    ],
                  }
                : undefined,
            }}
          >
            <Text>Accounts body</Text>
          </ScreenWithChrome>
        ),
      },
    ]),
  );

  return (
    <PagerContent
      state={{ index: options?.index ?? 1, routes } as never}
      descriptors={descriptors as never}
      actions={{ navigate: options?.navigate ?? jest.fn() } as never}
      emitter={{ emit: jest.fn(() => ({ defaultPrevented: false })) } as never}
      onAddAction={jest.fn()}
      preloadPage={jest.fn()}
    />
  );
}

describe('PrimaryPagerNavigator selection layout slots', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('gives selection summary and action dock real header and footer layout space without overlay coverage', () => {
    const { rerender } = render(renderPager(false));
    const initialHeader = screen.UNSAFE_getByType(HomeV2Header);
    const initialTabBar = screen.UNSAFE_getByType(PrimaryTabBar);

    rerender(renderPager(true));

    expect(screen.UNSAFE_getByType(HomeV2Header) === initialHeader).toBe(true);
    expect(screen.UNSAFE_getByType(PrimaryTabBar) === initialTabBar).toBe(true);

    const dock = screen.UNSAFE_getByType(SelectionActionBar);
    const frame = screen.UNSAFE_getByType(SafeAreaFrame);

    // SelectionSummary sits inside the pager SafeAreaFrame alongside the viewport (not floating over it).
    expect(frame.findAllByType(SelectionSummary)).toHaveLength(1);
    expect(frame.findAllByProps({ testID: 'pager-viewport' }).length).toBeGreaterThan(0);

    // SelectionActionBar sits outside SafeAreaFrame in the pager bottom slot with flow layout.
    expect(frame.findAllByType(SelectionActionBar)).toHaveLength(0);
    const animatedDock = dock.findAllByType(View).find(node => node.props.from);
    expect(StyleSheet.flatten(animatedDock?.props.style)?.position).not.toBe('absolute');

    // Covered chrome stays mounted with zero layout height.
    expect(StyleSheet.flatten(initialHeader.parent?.props.style)).toMatchObject({
      position: 'absolute',
      top: 0,
    });
    expect(StyleSheet.flatten(initialTabBar.parent?.props.style)).toMatchObject({
      position: 'absolute',
      bottom: 0,
    });
    expect(screen.getByText('Accounts body')).toBeTruthy();
  });

  it('exits selection mode on hardware Back before returning to Dashboard', () => {
    let listeners: (() => boolean)[] = [];
    const spy = jest
      .spyOn(BackHandler, 'addEventListener')
      .mockImplementation((event, callback) => {
        if (event === 'hardwareBackPress') {
          listeners.push(callback as () => boolean);
        }
        return {
          remove: () => {
            listeners = listeners.filter(item => item !== callback);
          },
        };
      });

    try {
      const navigate = jest.fn();
      const exitSelectionMode = jest.fn();
      const { rerender } = render(renderPager(true, { index: 1, navigate, exitSelectionMode }));

      expect(listeners[listeners.length - 1]?.()).toBe(true);
      expect(exitSelectionMode).toHaveBeenCalledTimes(1);
      expect(navigate).not.toHaveBeenCalled();

      rerender(renderPager(false, { index: 1, navigate, exitSelectionMode }));
      expect(listeners[listeners.length - 1]?.()).toBe(true);
      expect(navigate).toHaveBeenCalledWith('index');

      navigate.mockClear();
      rerender(renderPager(true, { index: 0, navigate, exitSelectionMode }));
      expect(listeners[listeners.length - 1]?.()).toBe(true);
      expect(exitSelectionMode).toHaveBeenCalledTimes(2);
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
