import { useLayoutEffect, useRef, useCallback, useState } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PageScrollStateChangedNativeEventData,
} from 'react-native-pager-view';
import Animated, { useEvent } from 'react-native-reanimated';
import { useTheme } from '@/src/hooks/use-theme';
import { PrimaryPagerPageContent } from './PrimaryPagerPageContent';
import type { PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';

const NativePager = Animated.createAnimatedComponent(PagerView);
// Native page changes normally settle well before this; this is recovery, not animation timing.
const PAGE_TRANSITION_WATCHDOG_MS = 1500;

/** A single six-leaf native surface. Only native events drive finger progress. */
export function HomeV2Viewport({
  pages,
  committedIndex,
  mountedIndices,
  reduceMotion,
  scrollEnabled,
  pageProgress,
  onPageSelected,
  onTransitioningChange,
}: PrimaryPagerViewportProps) {
  const { theme } = useTheme();
  const pager = useRef<PagerView>(null);
  const nativeIndex = useRef(committedIndex);
  const [interactivePageIndex, setInteractivePageIndex] = useState(committedIndex);
  const routeIndex = useRef(committedIndex);
  const commandTarget = useRef<number | null>(null);
  const deferredTarget = useRef<number | null>(null);
  const phase = useRef<'idle' | 'dragging' | 'settling'>('idle');
  const finishFrame = useRef<number | null>(null);
  const transitionWatchdog = useRef<ReturnType<typeof setTimeout> | null>(null);
  const permission = useRef(scrollEnabled);
  const callbacks = useRef({ onPageSelected, onTransitioningChange });
  useLayoutEffect(() => {
    callbacks.current = { onPageSelected, onTransitioningChange };
    permission.current = scrollEnabled;
  }, [onPageSelected, onTransitioningChange, scrollEnabled]);

  const recordNativeIndex = useCallback((index: number) => {
    nativeIndex.current = index;
  }, []);

  const clearTransitionWatchdog = useCallback(() => {
    if (transitionWatchdog.current !== null) clearTimeout(transitionWatchdog.current);
    transitionWatchdog.current = null;
  }, []);

  const armTransitionWatchdog = useCallback(() => {
    clearTransitionWatchdog();
    transitionWatchdog.current = setTimeout(() => {
      transitionWatchdog.current = null;
      if (phase.current === 'dragging' || commandTarget.current === null) return;

      const target = routeIndex.current;
      const currentPager = pager.current;
      if (currentPager) {
        currentPager.setPageWithoutAnimation(target);
        nativeIndex.current = target;
        setInteractivePageIndex(target);
        commandTarget.current = target;
      } else {
        deferredTarget.current = target;
        commandTarget.current = null;
      }
      phase.current = 'idle';
      pageProgress.set(target);
      callbacks.current.onTransitioningChange(false);
    }, PAGE_TRANSITION_WATCHDOG_MS);
  }, [clearTransitionWatchdog, pageProgress]);

  const attachPager = useCallback(
    (instance: PagerView | null) => {
      pager.current = instance;
      if (!instance || deferredTarget.current === null || phase.current === 'dragging') return;

      const target = deferredTarget.current;
      deferredTarget.current = null;
      commandTarget.current = target;
      instance.setPageWithoutAnimation(target);
      phase.current = 'idle';
      pageProgress.set(target);
      callbacks.current.onTransitioningChange(false);
      armTransitionWatchdog();
    },
    [armTransitionWatchdog, pageProgress],
  );

  const moveTo = useCallback(
    (index: number) => {
      if (phase.current === 'dragging') {
        deferredTarget.current = index;
        return;
      }
      if (index === nativeIndex.current && commandTarget.current === null) {
        pageProgress.set(index);
        callbacks.current.onTransitioningChange(false);
        return;
      }

      const currentPager = pager.current;
      if (!currentPager) {
        clearTransitionWatchdog();
        deferredTarget.current = index;
        commandTarget.current = null;
        phase.current = 'idle';
        callbacks.current.onTransitioningChange(false);
        return;
      }

      commandTarget.current = index;
      // Distant taps should not tour unrelated pages. Finger-driven physics stay native.
      if (reduceMotion || Math.abs(index - nativeIndex.current) > 1 || !permission.current) {
        currentPager.setPageWithoutAnimation(index);
        pageProgress.set(index);
        phase.current = 'idle';
        callbacks.current.onTransitioningChange(false);
        armTransitionWatchdog();
      } else {
        phase.current = 'settling';
        callbacks.current.onTransitioningChange(true);
        currentPager.setPage(index);
        armTransitionWatchdog();
      }
    },
    [armTransitionWatchdog, clearTransitionWatchdog, pageProgress, reduceMotion],
  );

  useLayoutEffect(() => {
    callbacks.current.onTransitioningChange(false);
  }, []);

  useLayoutEffect(() => {
    if (routeIndex.current === committedIndex) return;
    routeIndex.current = committedIndex;
    moveTo(committedIndex);
  }, [committedIndex, moveTo]);

  useLayoutEffect(() => {
    if (scrollEnabled) return;
    if (phase.current === 'idle') return;
    deferredTarget.current = null;
    if (finishFrame.current !== null) cancelAnimationFrame(finishFrame.current);
    finishFrame.current = null;
    clearTransitionWatchdog();
    phase.current = 'idle';
    const target = routeIndex.current;
    pageProgress.set(target);
    callbacks.current.onTransitioningChange(false);
    if (pager.current && nativeIndex.current !== target) {
      commandTarget.current = target;
      pager.current.setPageWithoutAnimation(target);
      armTransitionWatchdog();
    } else {
      commandTarget.current = null;
    }
  }, [armTransitionWatchdog, clearTransitionWatchdog, scrollEnabled, pageProgress]);

  useLayoutEffect(
    () => () => {
      if (finishFrame.current !== null) cancelAnimationFrame(finishFrame.current);
      clearTransitionWatchdog();
    },
    [clearTransitionWatchdog],
  );

  const finish = () => {
    if (phase.current !== 'idle') return;
    if (deferredTarget.current !== null) {
      const target = deferredTarget.current;
      deferredTarget.current = null;
      moveTo(target);
      return;
    }
    // iOS may deliver selected after idle. Keep the command pending until the
    // matching selection arrives rather than publishing the previous page.
    if (commandTarget.current !== null && nativeIndex.current !== commandTarget.current) return;
    clearTransitionWatchdog();
    commandTarget.current = null;
    const index = nativeIndex.current;
    setInteractivePageIndex(index);
    if (permission.current && index !== routeIndex.current) {
      // Selection and idle can both finalize the same gesture before React
      // commits the route update. Mark it delivered before invoking navigation.
      routeIndex.current = index;
      callbacks.current.onPageSelected(index);
    }
    pageProgress.set(index);
    callbacks.current.onTransitioningChange(false);
  };

  const count = pages.length;
  const onScroll = useEvent<PagerViewOnPageScrollEvent>(
    event => {
      'worklet';
      pageProgress.set(Math.max(0, Math.min(count - 1, event.position + event.offset)));
    },
    ['onPageScroll'],
  );

  return (
    <NativePager
      ref={attachPager}
      style={styles.pager}
      initialPage={committedIndex}
      offscreenPageLimit={1}
      scrollEnabled={scrollEnabled}
      overdrag={false}
      keyboardDismissMode="none"
      onPageScroll={onScroll}
      onPageSelected={event => {
        const index = event.nativeEvent.position;
        if (commandTarget.current !== null && index !== commandTarget.current) return;
        if (!permission.current && commandTarget.current === null) return;
        recordNativeIndex(index);
        if (phase.current === 'idle') finish();
      }}
      onPageScrollStateChanged={(event: { nativeEvent: PageScrollStateChangedNativeEventData }) => {
        const next = event.nativeEvent.pageScrollState;
        if (finishFrame.current !== null) cancelAnimationFrame(finishFrame.current);
        finishFrame.current = null;
        phase.current = next;
        if (next === 'dragging') {
          clearTransitionWatchdog();
          commandTarget.current = null;
          callbacks.current.onTransitioningChange(true);
        } else if (next === 'settling') {
          callbacks.current.onTransitioningChange(true);
        } else {
          finishFrame.current = requestAnimationFrame(finish);
        }
      }}
    >
      {pages.map((page, index) => {
        const active = index === committedIndex;
        return (
          <View
            key={page.name}
            collapsable={false}
            style={[styles.fill, { backgroundColor: theme.background }]}
            // Keep the physically selected page interactive until native
            // confirms the route handoff. This avoids a dead touch surface if
            // route state advances before the pager does.
            pointerEvents={active || index === interactivePageIndex ? 'auto' : 'none'}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
          >
            <View style={styles.body}>
              {mountedIndices.has(index) || active ? (
                <PrimaryPagerPageContent page={page} />
              ) : (
                <View style={styles.placeholder}>
                  <ActivityIndicator color={theme.primary} accessibilityLabel="Loading page" />
                </View>
              )}
            </View>
          </View>
        );
      })}
    </NativePager>
  );
}

const styles = StyleSheet.create({
  pager: { flex: 1 },
  fill: { width: '100%', height: '100%' },
  body: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
