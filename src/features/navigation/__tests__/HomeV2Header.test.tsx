import {
  PersistentTabChromeProvider,
  PersistentTabLeaf,
  usePublishTabChrome,
} from '@/src/components/layout/PersistentTabChrome';
import type { TabScreenChrome } from '@/src/components/layout/screenChrome';
import { HomeV2Header } from '@/src/features/navigation/HomeV2Header';
import { getSelectionState } from '@/src/hooks/selectionState';
import { render, screen } from '@/src/testing/render';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

jest.mock('@/src/contexts/WorkplaceContext', () => ({
  useWorkplace: () => ({
    workplaceId: 'home',
    activeWorkplace: { id: 'home', name: 'Home', icon: 'briefcase' },
  }),
}));

jest.mock('@/src/navigation/primaryNavigation', () => ({
  PRIMARY_NAVIGATION_TRIGGER_SIZE: 40,
  useHasMultipleWorkplaces: () => false,
  usePrimaryNavigation: () => ({
    openDrawer: jest.fn(),
    userName: 'Test',
    selectionModeActive: false,
  }),
}));

jest.mock('@/src/navigation/PrimaryNavigationHeader', () => ({
  PrimaryNavigationHeader: () => null,
}));

jest.mock('@/src/features/navigation/HomeV2PagePicker', () => {
  const { createElement } = jest.requireActual<typeof import('react')>('react');
  const { View: RNView } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    HomeV2PagePicker: ({
      disabled,
      children,
    }: {
      disabled?: boolean;
      children?: React.ReactNode;
    }) =>
      createElement(
        RNView,
        { testID: 'home-v2-page-picker', accessibilityState: { disabled } },
        children,
      ),
  };
});

function Publisher({ chrome }: { chrome: TabScreenChrome }) {
  usePublishTabChrome(chrome);
  return null;
}

function Harness({ selectionActive }: { selectionActive: boolean }) {
  const pageProgress = useSharedValue(0);
  const chrome: TabScreenChrome = {
    kind: 'tab',
    screenTitle: 'Dashboard',
    headerActions: <View testID="active-header-action" />,
    selection: selectionActive
      ? {
          state: getSelectionState(new Set(['1']), ['1']),
          itemTypeLabel: 'transaction',
          exitSelectionMode: jest.fn(),
          selectAll: jest.fn(),
          clearItems: jest.fn(),
        }
      : undefined,
  };
  return (
    <PersistentTabChromeProvider>
      <PersistentTabLeaf routeName="index">
        <Publisher chrome={chrome} />
      </PersistentTabLeaf>
      <HomeV2Header
        activeRouteName="index"
        pageProgress={pageProgress}
        onNavigate={jest.fn()}
        isTransitioning={false}
      />
    </PersistentTabChromeProvider>
  );
}

function findActionLayer(node: ReturnType<typeof screen.getByTestId>) {
  let current = node.parent;
  while (current && current.props.testID !== 'home-v2-header') {
    if (current.props.pointerEvents !== undefined) return current;
    current = current.parent;
  }
  return null;
}

describe('HomeV2Header selection coverage', () => {
  it('disables header action pointer events and page picker while covered by selection chrome', () => {
    const { rerender } = render(<Harness selectionActive={false} />);

    const activeActionLayer = findActionLayer(screen.getByTestId('active-header-action'));
    expect(activeActionLayer?.props.pointerEvents).toBe('auto');
    expect(screen.getByTestId('home-v2-page-picker').props.accessibilityState.disabled).toBe(false);

    rerender(<Harness selectionActive />);

    const coveredToolbar = screen.getByTestId('home-v2-header', { includeHiddenElements: true });
    expect(coveredToolbar.props.pointerEvents).toBe('none');
    const coveredActionLayer = findActionLayer(
      screen.getByTestId('active-header-action', { includeHiddenElements: true }),
    );
    expect(coveredActionLayer?.props.pointerEvents).toBe('none');
    expect(coveredActionLayer?.props.accessibilityElementsHidden).toBe(true);
    expect(coveredActionLayer?.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(
      screen.getByTestId('home-v2-page-picker', { includeHiddenElements: true }).props
        .accessibilityState.disabled,
    ).toBe(true);
  });
});
