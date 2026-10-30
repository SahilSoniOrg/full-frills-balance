import { useCallback, useLayoutEffect, useMemo, useRef, type ReactNode } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import PagerView, {
  type PageScrollStateChangedNativeEventData,
  type PagerViewOnPageScrollEvent,
} from 'react-native-pager-view';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useEvent, type SharedValue } from 'react-native-reanimated';

import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { primaryPageFromRouteName } from './primaryPages';
import { usePrimaryPagerNavigation } from './primaryPageNavigation';

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

const EDGE_WIDTH = 28;
const EDGE_COMMIT = 48;

type GroupInnerPagerProps = {
  tapOnly?: boolean;
  group: 'accounts' | 'commitments';
  pageCount: number;
  index: number;
  pageProgress: SharedValue<number>;
  onIndexChange: (index: number) => void;
  /** Fired when the user pans past the first/last inner page toward another group. */
  onEdgeSwipe?: (direction: 'prev' | 'next') => void;
  children: ReactNode;
};

function writePageProgress(progress: SharedValue<number>, value: number) {
  'worklet';
  progress.value = value;
}

/**
 * Horizontal pager for sibling tabs inside a primary group. Keep group chrome
 * (title / AppTabs) outside this component so those areas still drive the outer
 * strip; only the body children pan here.
 *
 * Edge handoff uses thin overlay strips so we never wrap PagerView in
 * GestureDetector (that pattern blocked iOS paging on the outer strip).
 */
export function GroupInnerPager({
  tapOnly = false,
  group,
  pageCount,
  index,
  pageProgress,
  onIndexChange,
  onEdgeSwipe,
  children,
}: GroupInnerPagerProps) {
  const navigation = usePrimaryPagerNavigation();
  const reduceMotion = useReducedMotion();
  const scrollEnabled = navigation
    ? !tapOnly &&
      navigation.scrollEnabled &&
      primaryPageFromRouteName(navigation.activeRouteName)?.group === group
    : !tapOnly && Platform.OS !== 'web';

  const pagerRef = useRef<PagerView>(null);
  const committedIndexRef = useRef(index);
  const pendingUserIndexRef = useRef<number | null>(null);
  const programmaticTargetRef = useRef<number | null>(null);
  const userGestureRef = useRef(false);
  const gestureEpochRef = useRef(0);
  const scrollEnabledRef = useRef(scrollEnabled);

  useLayoutEffect(() => {
    scrollEnabledRef.current = scrollEnabled;
  }, [scrollEnabled]);

  // Drive the native page from the committed route. useLayoutEffect so the ref
  // is attached; retry once on the next frame if setPage raced layout.
  useLayoutEffect(() => {
    if (tapOnly) {
      committedIndexRef.current = index;
      writePageProgress(pageProgress, index);
      return;
    }
    if (pendingUserIndexRef.current === index) {
      pendingUserIndexRef.current = null;
      programmaticTargetRef.current = null;
      committedIndexRef.current = index;
      writePageProgress(pageProgress, index);
      return;
    }

    // Finger swipe (or a prior setPage) already committed this index.
    if (committedIndexRef.current === index) {
      writePageProgress(pageProgress, index);
      return;
    }

    committedIndexRef.current = index;
    userGestureRef.current = false;
    gestureEpochRef.current += 1;
    programmaticTargetRef.current = index;
    writePageProgress(pageProgress, index);

    // Outer-strip entry must jump; animating here reads as an auto sibling
    // transition when coming back into a keep-alive group. In-group tab taps
    // still animate unless Reduce Motion is enabled.
    const animate = !navigation?.isTransitioning && !reduceMotion;
    const target = index;
    const apply = () => {
      if (programmaticTargetRef.current !== target) return;
      if (animate) pagerRef.current?.setPage(target);
      else pagerRef.current?.setPageWithoutAnimation(target);
    };
    apply();
    if (pagerRef.current) return;
    const retry = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(retry);
  }, [index, pageProgress, navigation?.isTransitioning, reduceMotion, tapOnly]);

  useLayoutEffect(() => {
    if (scrollEnabled) return;
    if (!userGestureRef.current && pendingUserIndexRef.current === null) return;
    userGestureRef.current = false;
    pendingUserIndexRef.current = null;
    gestureEpochRef.current += 1;
    programmaticTargetRef.current = committedIndexRef.current;
    pagerRef.current?.setPageWithoutAnimation(committedIndexRef.current);
    writePageProgress(pageProgress, committedIndexRef.current);
  }, [scrollEnabled, pageProgress]);

  const onPageScroll = useEvent<PagerViewOnPageScrollEvent>(
    event => {
      'worklet';
      const position = Math.min(Math.max(event.position + event.offset, 0), pageCount - 1);
      writePageProgress(pageProgress, position);
    },
    ['onPageScroll'],
  );

  const onPageSelectedNative = (event: { nativeEvent: { position: number } }) => {
    const next = event.nativeEvent.position;
    if (programmaticTargetRef.current === next) {
      programmaticTargetRef.current = null;
      committedIndexRef.current = next;
      writePageProgress(pageProgress, next);
      return;
    }
    if (!scrollEnabledRef.current || next === committedIndexRef.current) {
      return;
    }

    userGestureRef.current = false;
    pendingUserIndexRef.current = next;
    committedIndexRef.current = next;
    writePageProgress(pageProgress, next);
    onIndexChange(next);
  };

  const onPageScrollStateChanged = (event: {
    nativeEvent: PageScrollStateChangedNativeEventData;
  }) => {
    const state = event.nativeEvent.pageScrollState;
    if (state === 'dragging') {
      gestureEpochRef.current += 1;
      userGestureRef.current = scrollEnabledRef.current;
      return;
    }
    if (state !== 'idle') return;

    const epoch = gestureEpochRef.current;
    requestAnimationFrame(() => {
      if (gestureEpochRef.current !== epoch || pendingUserIndexRef.current !== null) return;
      userGestureRef.current = false;
      writePageProgress(pageProgress, committedIndexRef.current);
    });
  };

  const emitPrevEdge = useCallback(() => {
    if (scrollEnabled && index === 0) onEdgeSwipe?.('prev');
  }, [scrollEnabled, index, onEdgeSwipe]);

  const emitNextEdge = useCallback(() => {
    if (scrollEnabled && index === pageCount - 1) onEdgeSwipe?.('next');
  }, [scrollEnabled, index, pageCount, onEdgeSwipe]);

  const prevEdge = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(EDGE_COMMIT / 2)
        .failOffsetX(-EDGE_COMMIT / 2)
        .failOffsetY([-20, 20])
        .onEnd((event, success) => {
          'worklet';
          if (success && event.translationX > EDGE_COMMIT) runOnJS(emitPrevEdge)();
        }),
    [emitPrevEdge],
  );

  const nextEdge = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX(-EDGE_COMMIT / 2)
        .failOffsetX(EDGE_COMMIT / 2)
        .failOffsetY([-20, 20])
        .onEnd((event, success) => {
          'worklet';
          if (success && event.translationX < -EDGE_COMMIT) runOnJS(emitNextEdge)();
        }),
    [emitNextEdge],
  );

  const childList = Array.isArray(children) ? children : [children];
  const showPrevEdge = scrollEnabled && !!onEdgeSwipe && index === 0;
  const showNextEdge = scrollEnabled && !!onEdgeSwipe && index === pageCount - 1;

  if (tapOnly) {
    return (
      <View style={styles.fill}>
        {childList.map((child, childIndex) => {
          const active = childIndex === index;
          return (
            <View
              key={childIndex}
              style={[StyleSheet.absoluteFill, !active && styles.hidden]}
              pointerEvents={active ? 'auto' : 'none'}
              accessibilityElementsHidden={!active}
              importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
            >
              {child}
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      <AnimatedPagerView
        ref={pagerRef}
        style={styles.fill}
        initialPage={index}
        scrollEnabled={scrollEnabled}
        offscreenPageLimit={1}
        onPageScroll={onPageScroll}
        onPageSelected={onPageSelectedNative}
        onPageScrollStateChanged={onPageScrollStateChanged}
      >
        {childList.map((child, childIndex) => (
          <View key={childIndex} collapsable={false} style={styles.fill}>
            {child}
          </View>
        ))}
      </AnimatedPagerView>
      {showPrevEdge ? (
        <GestureDetector gesture={prevEdge}>
          <View
            style={styles.edgeLeft}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </GestureDetector>
      ) : null}
      {showNextEdge ? (
        <GestureDetector gesture={nextEdge}>
          <View
            style={styles.edgeRight}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </GestureDetector>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: { display: 'none' },
  fill: { flex: 1 },
  edgeLeft: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: EDGE_WIDTH,
  },
  edgeRight: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: EDGE_WIDTH,
  },
});
