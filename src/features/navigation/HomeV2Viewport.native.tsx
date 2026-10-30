import { useLayoutEffect, useRef, useCallback } from 'react';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import PagerView, {
  type PagerViewOnPageScrollEvent,
  type PageScrollStateChangedNativeEventData,
} from 'react-native-pager-view';
import Animated, { useEvent } from 'react-native-reanimated';
import { useTheme } from '@/src/hooks/use-theme';
import { HomeV2Subtabs } from './HomeV2Subtabs';
import { PrimaryPagerPageContent } from './PrimaryPagerPageContent';
import type { PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';

const NativePager = Animated.createAnimatedComponent(PagerView);

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
  const routeIndex = useRef(committedIndex);
  const commandTarget = useRef<number | null>(null);
  const deferredTarget = useRef<number | null>(null);
  const phase = useRef<'idle' | 'dragging' | 'settling'>('idle');
  const finishFrame = useRef<number | null>(null);
  const permission = useRef(scrollEnabled);
  const callbacks = useRef({ onPageSelected, onTransitioningChange });
  useLayoutEffect(() => {
    callbacks.current = { onPageSelected, onTransitioningChange };
    permission.current = scrollEnabled;
  }, [onPageSelected, onTransitioningChange, scrollEnabled]);

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
      commandTarget.current = index;
      // Distant taps should not tour unrelated pages. Finger-driven physics stay native.
      if (reduceMotion || Math.abs(index - nativeIndex.current) > 1 || !permission.current) {
        pager.current?.setPageWithoutAnimation(index);
        nativeIndex.current = index;
        pageProgress.set(index);
        phase.current = 'idle';
        callbacks.current.onTransitioningChange(false);
      } else {
        phase.current = 'settling';
        callbacks.current.onTransitioningChange(true);
        pager.current?.setPage(index);
      }
    },
    [pageProgress, reduceMotion],
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
    deferredTarget.current = null;
    if (finishFrame.current !== null) cancelAnimationFrame(finishFrame.current);
    if (phase.current === 'idle') return;
    phase.current = 'idle';
    commandTarget.current = routeIndex.current;
    nativeIndex.current = routeIndex.current;
    pager.current?.setPageWithoutAnimation(routeIndex.current);
    pageProgress.set(routeIndex.current);
    callbacks.current.onTransitioningChange(false);
  }, [scrollEnabled, pageProgress]);

  useLayoutEffect(
    () => () => {
      if (finishFrame.current !== null) cancelAnimationFrame(finishFrame.current);
    },
    [],
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
    commandTarget.current = null;
    const index = nativeIndex.current;
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
      ref={pager}
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
        nativeIndex.current = index;
        if (phase.current === 'idle') finish();
      }}
      onPageScrollStateChanged={(event: { nativeEvent: PageScrollStateChangedNativeEventData }) => {
        const next = event.nativeEvent.pageScrollState;
        if (finishFrame.current !== null) cancelAnimationFrame(finishFrame.current);
        phase.current = next;
        if (next === 'dragging') {
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
            pointerEvents={active ? 'auto' : 'none'}
            accessibilityElementsHidden={!active}
            importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
          >
            <HomeV2Subtabs routeName={page.name} />
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
