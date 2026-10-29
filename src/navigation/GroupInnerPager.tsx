import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView, {
  type PageScrollStateChangedNativeEventData,
  type PagerViewOnPageScrollEvent,
} from 'react-native-pager-view';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { runOnJS, useEvent, type SharedValue } from 'react-native-reanimated';

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

const EDGE_WIDTH = 28;
const EDGE_COMMIT = 48;

type GroupInnerPagerProps = {
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
 */
export function GroupInnerPager({
  pageCount,
  index,
  pageProgress,
  onIndexChange,
  onEdgeSwipe,
  children,
}: GroupInnerPagerProps) {
  const pagerRef = useRef<PagerView>(null);
  const indexRef = useRef(index);
  const pendingRef = useRef<number | null>(null);
  const programmaticRef = useRef<number | null>(null);
  const userGestureRef = useRef(false);

  useEffect(() => {
    if (indexRef.current === index) return;
    indexRef.current = index;
    if (pendingRef.current === index) {
      pendingRef.current = null;
      programmaticRef.current = null;
      return;
    }
    programmaticRef.current = index;
    pagerRef.current?.setPage(index);
  }, [index]);

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
    if (programmaticRef.current === next) {
      programmaticRef.current = null;
      return;
    }
    if (!userGestureRef.current || next === indexRef.current) return;
    userGestureRef.current = false;
    pendingRef.current = next;
    indexRef.current = next;
    onIndexChange(next);
  };

  const onPageScrollStateChanged = (event: {
    nativeEvent: PageScrollStateChangedNativeEventData;
  }) => {
    const state = event.nativeEvent.pageScrollState;
    if (state === 'dragging') {
      userGestureRef.current = true;
      return;
    }
    if (state === 'idle') userGestureRef.current = false;
  };

  const emitPrevEdge = useCallback(() => {
    onEdgeSwipe?.('prev');
  }, [onEdgeSwipe]);

  const emitNextEdge = useCallback(() => {
    onEdgeSwipe?.('next');
  }, [onEdgeSwipe]);

  const prevEdge = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([EDGE_COMMIT / 2, 1000])
        .failOffsetY([-20, 20])
        .onEnd(event => {
          'worklet';
          if (event.translationX > EDGE_COMMIT) runOnJS(emitPrevEdge)();
        }),
    [emitPrevEdge],
  );

  const nextEdge = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-1000, -EDGE_COMMIT / 2])
        .failOffsetY([-20, 20])
        .onEnd(event => {
          'worklet';
          if (event.translationX < -EDGE_COMMIT) runOnJS(emitNextEdge)();
        }),
    [emitNextEdge],
  );

  const childList = Array.isArray(children) ? children : [children];

  return (
    <View style={styles.fill}>
      <AnimatedPagerView
        ref={pagerRef}
        style={styles.fill}
        initialPage={index}
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
      {onEdgeSwipe && index <= 0 ? (
        <GestureDetector gesture={prevEdge}>
          <View
            style={styles.edgeLeft}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        </GestureDetector>
      ) : null}
      {onEdgeSwipe && index >= pageCount - 1 ? (
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
