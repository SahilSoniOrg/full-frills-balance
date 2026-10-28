import {
  PrimaryPrivacyScopeStoreProvider,
  PrivacyScopeProvider,
} from '@/src/contexts/PrivacyScope';
import { useAppLock } from '@/src/contexts/app-shell/AppLockProvider';
import { AccountsGroupProvider } from '@/src/features/accounts';
import { CommitmentsGroupProvider } from '@/src/features/commitments';
import { PrimaryTabBar } from './PrimaryTabBar';
import type { ContextualAddAction } from './ContextualAddMenu';
import type { PrimaryPagerPage, PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';
import { usePrimaryNavigation } from '@/src/navigation/primaryNavigation';
import {
  PRIMARY_PAGES,
  primaryPageForIndex,
  primaryPageFromRouteName,
  rememberPrimaryGroupRoute,
} from '@/src/navigation/primaryPages';
import { PrimaryPageNavigationProvider } from '@/src/navigation/primaryPageNavigation';
import { RemountOnWorkplace } from '@/src/navigation/RemountOnWorkplace';
import { useWorkplace } from '@/src/contexts/WorkplaceContext';
import { useKeyboard } from '@/src/design-system/Keyboard';
import type { NavigatorContentProps } from 'expo-router';
import { unstable_useReconcileTabHistory, useIsFocused } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, AppState, BackHandler, Platform, StyleSheet, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { GestureType } from 'react-native-gesture-handler';
import type { ComponentType } from 'react';

type PrimaryPageOptions = { title?: string };
type PrimaryPageEvents = {
  tabPress: { data: undefined; canPreventDefault: true };
  tabLongPress: { data: undefined; canPreventDefault: false };
};
export type PrimaryPageNavigatorProps = NavigatorContentProps<
  PrimaryPageOptions,
  PrimaryPageEvents,
  { onAddAction: (action: ContextualAddAction) => void }
>;

export function createPrimaryPagerContent(
  PrimaryPagerViewport: ComponentType<PrimaryPagerViewportProps>,
): ComponentType<PrimaryPageNavigatorProps> {
  return function PrimaryPagerContent({
    state,
    descriptors,
    actions,
    emitter,
    onAddAction,
  }: PrimaryPageNavigatorProps) {
    unstable_useReconcileTabHistory();
    const workplace = useWorkplace();
    const primaryNavigation = usePrimaryNavigation();
    const isFocused = useIsFocused();
    const { isAppCurrentlyLocked } = useAppLock();
    const { isKeyboardVisible } = useKeyboard();
    const [isScreenReaderEnabled, setScreenReaderEnabled] = useState(false);
    const [isAppActive, setAppActive] = useState(AppState.currentState === 'active');
    const [isTransitioning, setTransitioning] = useState(false);
    const [mountedIndices, setMountedIndices] = useState<ReadonlySet<number>>(
      () => new Set([state.index]),
    );
    const [pageSwipeLocks, setPageSwipeLocks] = useState<ReadonlySet<string>>(() => new Set());
    const pageProgress = useSharedValue(state.index);
    const activeRouteName = state.routes[state.index]?.name ?? 'index';
    const activePage = primaryPageFromRouteName(activeRouteName);
    const routeNames = useMemo(() => state.routes.map(route => route.name), [state.routes]);

    useEffect(() => {
      rememberPrimaryGroupRoute(activeRouteName);
      primaryNavigation?.reportActiveRoute?.(activeRouteName);
    }, [activeRouteName, primaryNavigation?.reportActiveRoute]);

    useEffect(() => {
      // Grow the mount set to cover the committed page and its neighbors so a
      // swipe/tap destination can paint without waiting for eviction.
      setMountedIndices(previous => {
        const next = new Set(previous);
        next.add(state.index);
        if (state.index > 0) next.add(state.index - 1);
        if (state.index + 1 < state.routes.length) next.add(state.index + 1);
        return next;
      });
    }, [state.index, state.routes.length]);

    useEffect(() => {
      // After settle, keep only the sliding window {index-1, index, index+1}.
      if (isTransitioning) return;
      setMountedIndices(() => {
        const next = new Set<number>([state.index]);
        if (state.index > 0) next.add(state.index - 1);
        if (state.index + 1 < state.routes.length) next.add(state.index + 1);
        return next;
      });
    }, [isTransitioning, state.index, state.routes.length]);

    useEffect(() => {
      pageProgress.value = state.index;
    }, [state.index, pageProgress]);

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

    useEffect(() => {
      // First-route Back policy: any non-Dashboard primary page returns to
      // Dashboard; Dashboard yields to the surrounding navigator/system.
      if (Platform.OS === 'web' || !isFocused) return;
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        if (primaryNavigation?.drawerVisible) return false;
        if (state.index === 0) return false;
        actions.navigate('index');
        return true;
      });
      return () => subscription.remove();
    }, [actions, isFocused, primaryNavigation?.drawerVisible, state.index]);

    const setPageSwipeLock = useCallback((lockId: string, locked: boolean) => {
      setPageSwipeLocks(previous => {
        if (previous.has(lockId) === locked) return previous;
        const next = new Set(previous);
        if (locked) next.add(lockId);
        else next.delete(lockId);
        return next;
      });
    }, []);

    const navigateToPage = useCallback(
      (routeName: string) => {
        if (!primaryPageFromRouteName(routeName) || !routeNames.includes(routeName)) return;
        if (routeName === activeRouteName) return;
        setTransitioning(false);
        actions.navigate(routeName);
      },
      [actions, activeRouteName, routeNames],
    );

    const onUserPageSelected = useCallback(
      (index: number) => {
        const page = primaryPageForIndex(index);
        if (!page || !routeNames.includes(page.routeName)) return;
        actions.navigate(page.routeName);
      },
      [actions, routeNames],
    );

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
    const reportPageGesture = useCallback(
      (gesture: GestureType | null) => primaryNavigation?.reportPageGesture?.(gesture),
      [primaryNavigation?.reportPageGesture],
    );

    const pages = useMemo<PrimaryPagerPage[]>(
      () =>
        state.routes.map(route => ({
          key: route.key,
          name: route.name,
          render: () => {
            const page = PRIMARY_PAGES.find(item => item.routeName === route.name);
            const descriptor = descriptors[route.key];
            return page && descriptor ? (
              <PrivacyScopeProvider key={route.key} scopeKey={page.group}>
                {descriptor.render()}
              </PrivacyScopeProvider>
            ) : null;
          },
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

    const viewportProps: PrimaryPagerViewportProps = {
      pages,
      committedIndex: state.index,
      mountedIndices,
      isTransitioning,
      scrollEnabled,
      pageProgress,
      onPageSelected: onUserPageSelected,
      onTransitioningChange: setTransitioning,
      onPageGestureReady: reportPageGesture,
    };

    return (
      <View style={styles.container}>
        <PrimaryPageNavigationProvider
          value={{
            activeRouteName,
            isTransitioning,
            pageProgress,
            navigateToPage,
            setPageSwipeLock,
          }}
        >
          <RemountOnWorkplace>
            <AccountsGroupProvider active={activePage?.group === 'accounts'}>
              <CommitmentsGroupProvider>
                <PrimaryPrivacyScopeStoreProvider>
                  <PrimaryPagerViewport {...viewportProps} />
                </PrimaryPrivacyScopeStoreProvider>
              </CommitmentsGroupProvider>
            </AccountsGroupProvider>
          </RemountOnWorkplace>
          <PrimaryTabBar
            routes={state.routes}
            activeRouteName={activeRouteName}
            emitTabPress={emitTabPress}
            emitTabLongPress={emitTabLongPress}
            onNavigateToPage={navigateToPage}
            isSwitching={workplace.isSwitchingWorkplace}
            isTransitioning={isTransitioning}
            onAddAction={onAddAction}
          />
        </PrimaryPageNavigationProvider>
      </View>
    );
  };
}

const styles = StyleSheet.create({ container: { flex: 1 } });
