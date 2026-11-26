import {
  PrimaryPrivacyScopeStoreProvider,
  PrivacyScopeProvider,
} from '@/src/contexts/PrivacyScope';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { AccountsGroupProvider } from '@/src/features/accounts';
import { PrimaryTabBar, type PrimaryTabBarProps } from './PrimaryTabBar';
import type { ContextualAddAction } from './ContextualAddMenu';
import type { PrimaryPagerPage, PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';
import {
  usePrimaryNavigation,
  useReportDrawerSwipePermission,
} from '@/src/navigation/primaryNavigation';
import {
  PRIMARY_PAGES,
  primaryPageIndex,
  primaryPageFromRouteName,
  rememberPrimaryGroupRoute,
} from '@/src/navigation/primaryPages';
import { PrimaryPageNavigationProvider } from '@/src/navigation/primaryPageNavigation';
import { RemountOnWorkplace } from '@/src/navigation/RemountOnWorkplace';
import { runAfterInteractions } from '@/src/utils/scheduler';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useKeyboard } from '@/src/design-system/Keyboard';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { useTheme } from '@/src/hooks/use-theme';
import type { NavigatorContentProps } from 'expo-router';
import { unstable_useReconcileTabHistory, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  AppState,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  View,
} from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { ComponentType, ReactNode } from 'react';
import {
  PersistentTabChromeProvider,
  PersistentTabLeaf,
  usePersistentTabChrome,
} from '@/src/components/layout/PersistentTabChrome';
import {
  SelectionFooterHost,
  SelectionHeaderHost,
} from '@/src/components/shared/SelectionChromeHost';
import {
  SafeAreaFrame,
  SafeAreaScope,
  useWindowSafeAreaLayout,
} from '@/src/design-system/SafeArea';
import { HomeV2Header } from './HomeV2Header';
import { usePrimaryPageTransitions } from './usePrimaryPageTransitions';

type PrimaryPageOptions = { title?: string };
type PrimaryPageEvents = {
  tabPress: { data: undefined; canPreventDefault: true };
  tabLongPress: { data: undefined; canPreventDefault: false };
};
export type PrimaryPageNavigatorProps = NavigatorContentProps<
  PrimaryPageOptions,
  PrimaryPageEvents,
  { onAddAction: (action: ContextualAddAction) => void },
  { preloadPage: (routeName: string) => void }
>;

function renderLeafPage(
  routeName: string,
  descriptors: PrimaryPageNavigatorProps['descriptors'],
  routes: PrimaryPageNavigatorProps['state']['routes'],
) {
  const page = primaryPageFromRouteName(routeName);
  if (!page) return null;
  const route = routes.find(item => item.name === routeName);
  const descriptor = route
    ? (descriptors[route.key] ?? descriptors[route.name])
    : descriptors[routeName];
  return (
    <PersistentTabLeaf routeName={routeName}>
      <PrivacyScopeProvider scopeKey={page.group}>{descriptor?.render()}</PrivacyScopeProvider>
    </PersistentTabLeaf>
  );
}

export function createPrimaryPagerContent(
  Viewport: ComponentType<PrimaryPagerViewportProps>,
): ComponentType<PrimaryPageNavigatorProps> {
  return function PrimaryPagerContent({
    state,
    descriptors,
    actions,
    emitter,
    onAddAction,
    preloadPage,
  }: PrimaryPageNavigatorProps) {
    unstable_useReconcileTabHistory();
    const workplace = useWorkplace();
    const primaryNavigation = usePrimaryNavigation();
    const reportActiveRoute = primaryNavigation?.reportActiveRoute;
    const isFocused = useIsFocused();
    const { isAppCurrentlyLocked } = useAppLock();
    const { isKeyboardVisible } = useKeyboard();
    const reduceMotion = useReducedMotion();
    const [isScreenReaderEnabled, setScreenReaderEnabled] = useState(false);
    const [isAppActive, setAppActive] = useState(AppState.currentState === 'active');
    const activeRouteName = state.routes[state.index]?.name ?? 'index';
    const routeNames = useMemo(() => state.routes.map(route => route.name), [state.routes]);
    const {
      isTransitioning,
      settledReadRoute,
      reportTransitioning,
      navigateToPage,
      onUserPageSelected,
    } = usePrimaryPageTransitions({
      activeRouteName,
      routeNames,
      actions,
      isSwitchingWorkplace: workplace.isSwitchingWorkplace,
      isFocused,
      isAppActive,
      isAppCurrentlyLocked,
    });
    const swipeIndex = Math.max(0, primaryPageIndex(activeRouteName));
    const swipePageCount = PRIMARY_PAGES.length;
    const [mountedIndices, setMountedIndices] = useState<ReadonlySet<number>>(
      () => new Set([swipeIndex]),
    );
    const [pageSwipeLocks, setPageSwipeLocks] = useState<ReadonlySet<string>>(() => new Set());
    const pageProgress = useSharedValue(swipeIndex);
    const preparedRoutes = useMemo(() => {
      const routes = new Set<string>();
      if (!isFocused || !isAppActive || isAppCurrentlyLocked || workplace.isSwitchingWorkplace)
        return routes;
      const center = primaryPageIndex(settledReadRoute);
      for (let offset = -1; offset <= 1; offset += 1) {
        const page = PRIMARY_PAGES[center + offset];
        if (page) routes.add(page.routeName);
      }
      return routes;
    }, [
      settledReadRoute,
      isFocused,
      isAppActive,
      isAppCurrentlyLocked,
      workplace.isSwitchingWorkplace,
    ]);

    useEffect(() => {
      rememberPrimaryGroupRoute(activeRouteName);
      reportActiveRoute?.(activeRouteName);
    }, [activeRouteName, reportActiveRoute]);

    useEffect(() => {
      // Never mount speculative neighbors while the native pager is moving.
      if (isTransitioning || preparedRoutes.size === 0) return;
      return runAfterInteractions(() => {
        // Placeholder descriptors render null. Materialize real router entries
        // before mounting neighbors so their effects and reads can prepare.
        // PRELOAD keeps the current selection and route history intact.
        for (let offset = -1; offset <= 1; offset += 1) {
          const page = PRIMARY_PAGES[swipeIndex + offset];
          if (page) preloadPage(page.routeName);
        }
        setMountedIndices(previous => {
          // Retain visited neighbors: eviction rebuilt observers and lists on every return.
          const next = new Set(previous);
          for (let offset = -1; offset <= 1; offset += 1) {
            const index = swipeIndex + offset;
            if (index >= 0 && index < swipePageCount) next.add(index);
          }
          return next.size === previous.size && [...next].every(index => previous.has(index))
            ? previous
            : next;
        });
      });
    }, [isTransitioning, swipeIndex, swipePageCount, preloadPage, preparedRoutes]);

    useEffect(() => {
      let mounted = true;
      void AccessibilityInfo.isScreenReaderEnabled().then(enabled => {
        if (mounted) setScreenReaderEnabled(enabled);
      });
      const subscription = AccessibilityInfo.addEventListener('screenReaderChanged', enabled => {
        setScreenReaderEnabled(enabled);
      });
      return () => {
        mounted = false;
        subscription.remove();
      };
    }, []);

    useEffect(() => {
      const subscription = AppState.addEventListener('change', nextState => {
        setAppActive(nextState === 'active');
      });
      return () => subscription.remove();
    }, []);

    const setPageSwipeLock = useCallback((lockId: string, locked: boolean) => {
      setPageSwipeLocks(previous => {
        if (previous.has(lockId) === locked) return previous;
        const next = new Set(previous);
        if (locked) next.add(lockId);
        else next.delete(lockId);
        return next;
      });
    }, []);

    const emitTabPress = useCallback(
      (routeKey: string) =>
        emitter.emit({ type: 'tabPress', target: routeKey, canPreventDefault: true })
          .defaultPrevented,
      [emitter],
    );
    const emitTabLongPress = useCallback(
      (routeKey: string) => {
        emitter.emit({ type: 'tabLongPress', target: routeKey });
      },
      [emitter],
    );
    const pages = useMemo<PrimaryPagerPage[]>(
      () =>
        PRIMARY_PAGES.map(page => ({
          name: page.routeName,
          render: () => renderLeafPage(page.routeName, descriptors, state.routes),
        })),
      [descriptors, state.routes],
    );

    const scrollEnabled =
      Platform.OS !== 'web' &&
      isFocused &&
      isAppActive &&
      !isKeyboardVisible &&
      !isAppCurrentlyLocked &&
      !isScreenReaderEnabled &&
      !workplace.isSwitchingWorkplace &&
      !primaryNavigation?.selectionModeActive &&
      !primaryNavigation?.drawerVisible &&
      pageSwipeLocks.size === 0;

    useReportDrawerSwipePermission(scrollEnabled);

    const viewportProps: PrimaryPagerViewportProps = {
      pages,
      committedIndex: swipeIndex,
      mountedIndices,
      reduceMotion,
      scrollEnabled,
      pageProgress,
      onPageSelected: onUserPageSelected,
      onTransitioningChange: reportTransitioning,
    };

    const tabBarProps: PrimaryTabBarProps = {
      routes: state.routes,
      activeRouteName,
      emitTabPress,
      emitTabLongPress,
      onNavigateToPage: navigateToPage,
      isSwitching: workplace.isSwitchingWorkplace,
      isTransitioning,
      pageProgress,
      onAddAction,
    };

    return (
      <PrimaryPageNavigationProvider
        liveRouteName={settledReadRoute}
        preparedRoutes={preparedRoutes}
        value={{
          activeRouteName,
          isTransitioning,
          scrollEnabled,
          pageProgress,
          navigateToPage,
          setPageSwipeLock,
        }}
      >
        <RemountOnWorkplace>
          <AccountsGroupProvider
            active={preparedRoutes.has('accounts') || preparedRoutes.has('categories')}
          >
            <PrimaryPrivacyScopeStoreProvider>
              <PersistentTabChromeProvider>
                <PrimaryPagerFrame tabBarProps={tabBarProps} isFocused={isFocused}>
                  <Viewport {...viewportProps} />
                </PrimaryPagerFrame>
              </PersistentTabChromeProvider>
            </PrimaryPrivacyScopeStoreProvider>
          </AccountsGroupProvider>
        </RemountOnWorkplace>
      </PrimaryPageNavigationProvider>
    );
  };
}

function PrimaryPagerFrame({
  children,
  tabBarProps,
  isFocused,
}: {
  children: ReactNode;
  tabBarProps: PrimaryTabBarProps;
  isFocused: boolean;
}) {
  const { activeRouteName, pageProgress, onNavigateToPage, isTransitioning } = tabBarProps;
  const selection = usePersistentTabChrome(activeRouteName)?.selection;
  const primaryNavigation = usePrimaryNavigation();
  const reportSelectionMode = primaryNavigation?.reportSelectionMode;
  const drawerVisible = primaryNavigation?.drawerVisible ?? false;
  const selectionModeActive = isFocused && Boolean(selection);
  const { isKeyboardVisible } = useKeyboard();
  const { insets, bottomSpacing } = useWindowSafeAreaLayout();
  const { theme } = useTheme();
  const page = primaryPageFromRouteName(activeRouteName);
  const selectionRef = useRef(selection);

  useLayoutEffect(() => {
    selectionRef.current = selection;
    reportSelectionMode?.(selectionModeActive);
  }, [reportSelectionMode, selection, selectionModeActive]);

  useEffect(() => {
    if (Platform.OS === 'web' || !isFocused) return;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (drawerVisible) return false;
      const currentSelection = selectionRef.current;
      if (currentSelection) {
        currentSelection.exitSelectionMode();
        return true;
      }
      if (primaryPageIndex(activeRouteName) <= 0) return false;
      onNavigateToPage('index');
      return true;
    });
    return () => subscription.remove();
  }, [activeRouteName, drawerVisible, isFocused, onNavigateToPage]);

  return (
    <View style={styles.container}>
      <SafeAreaFrame edges={['top', 'left', 'right']} style={styles.container}>
        <SafeAreaScope consumedEdges={['bottom']}>
          <PrivacyScopeProvider key={`header-${activeRouteName}`} scopeKey={page?.group}>
            <SelectionHeaderHost selection={selection} backgroundColor={theme.background}>
              <HomeV2Header
                activeRouteName={activeRouteName}
                pageProgress={pageProgress}
                onNavigate={onNavigateToPage}
                isTransitioning={isTransitioning}
                covered={Boolean(selection)}
              />
            </SelectionHeaderHost>
          </PrivacyScopeProvider>
          {children}
        </SafeAreaScope>
      </SafeAreaFrame>
      <PrivacyScopeProvider key={`footer-${activeRouteName}`} scopeKey={page?.group}>
        <KeyboardAvoidingView
          enabled={Platform.OS !== 'web'}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <SelectionFooterHost
            selection={selection}
            backgroundColor={theme.background}
            edgePadding={{
              bottom: isKeyboardVisible ? 0 : bottomSpacing.selectionActions,
              left: insets.left,
              right: insets.right,
            }}
          >
            <PrimaryTabBar {...tabBarProps} covered={Boolean(selection)} />
          </SelectionFooterHost>
        </KeyboardAvoidingView>
      </PrivacyScopeProvider>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
});
