import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import PagerView, {
  type PageScrollStateChangedNativeEventData,
  type PagerViewOnPageScrollEvent,
} from 'react-native-pager-view';
import Animated, { useEvent } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { Gesture, GestureDetector, type GestureType } from 'react-native-gesture-handler';
import { PrimaryPageGestureProvider } from '@/src/navigation/primaryPageNavigation';
import type { PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

function writePageProgress(progress: SharedValue<number>, value: number) {
  'worklet';
  progress.value = value;
}

export function PrimaryPagerViewport({
  pages,
  committedIndex,
  mountedIndices,
  isTransitioning,
  scrollEnabled,
  pageProgress,
  onPageSelected,
  onTransitioningChange,
  onPageGestureReady,
}: PrimaryPagerViewportProps) {
  const pagerRef = useRef<PagerView>(null);
  const committedIndexRef = useRef(committedIndex);
  const renderedIndexRef = useRef(committedIndex);
  const pendingUserIndexRef = useRef<number | null>(null);
  const programmaticTargetRef = useRef<number | null>(null);
  const userGestureRef = useRef(false);
  const gestureEpochRef = useRef(0);
  const nativeGesture = useMemo(() => Gesture.Native(), []) as GestureType;
  const pageCount = pages.length;

  const onPageScroll = useEvent<PagerViewOnPageScrollEvent>(
    event => {
      'worklet';
      const position = Math.min(Math.max(event.position + event.offset, 0), pageCount - 1);
      writePageProgress(pageProgress, position);
    },
    ['onPageScroll'],
  );

  useEffect(() => {
    onPageGestureReady(nativeGesture);
    return () => onPageGestureReady(null);
  }, [nativeGesture, onPageGestureReady]);

  useEffect(() => {
    if (renderedIndexRef.current === committedIndex) return;
    renderedIndexRef.current = committedIndex;
    committedIndexRef.current = committedIndex;
    writePageProgress(pageProgress, committedIndex);

    if (pendingUserIndexRef.current === committedIndex) {
      pendingUserIndexRef.current = null;
      programmaticTargetRef.current = null;
      return;
    }

    userGestureRef.current = false;
    gestureEpochRef.current += 1;
    programmaticTargetRef.current = committedIndex;
    pagerRef.current?.setPageWithoutAnimation(committedIndex);
  }, [committedIndex, pageProgress]);

  useEffect(() => {
    if (scrollEnabled) return;
    if (userGestureRef.current || pendingUserIndexRef.current !== null) {
      userGestureRef.current = false;
      pendingUserIndexRef.current = null;
      gestureEpochRef.current += 1;
      programmaticTargetRef.current = committedIndexRef.current;
      pagerRef.current?.setPageWithoutAnimation(committedIndexRef.current);
      writePageProgress(pageProgress, committedIndexRef.current);
      onTransitioningChange(false);
    }
  }, [scrollEnabled, pageProgress, onTransitioningChange]);

  const onPageSelectedNative = (event: { nativeEvent: { position: number } }) => {
    const index = event.nativeEvent.position;
    if (programmaticTargetRef.current === index) {
      programmaticTargetRef.current = null;
      return;
    }
    if (!scrollEnabled || !userGestureRef.current || index === committedIndexRef.current) return;

    userGestureRef.current = false;
    pendingUserIndexRef.current = index;
    committedIndexRef.current = index;
    writePageProgress(pageProgress, index);
    onPageSelected(index);
  };

  const onPageScrollStateChanged = (event: {
    nativeEvent: PageScrollStateChangedNativeEventData;
  }) => {
    const scrollState = event.nativeEvent.pageScrollState;
    if (scrollState === 'dragging') {
      gestureEpochRef.current += 1;
      userGestureRef.current = scrollEnabled;
      onTransitioningChange(scrollEnabled);
      return;
    }
    if (scrollState !== 'idle') return;

    const epoch = gestureEpochRef.current;
    onTransitioningChange(false);
    requestAnimationFrame(() => {
      if (gestureEpochRef.current !== epoch || pendingUserIndexRef.current !== null) return;
      userGestureRef.current = false;
      writePageProgress(pageProgress, committedIndexRef.current);
    });
  };

  return (
    <PrimaryPageGestureProvider value={nativeGesture}>
      <GestureDetector gesture={nativeGesture}>
        <AnimatedPagerView
          ref={pagerRef}
          style={styles.pager}
          initialPage={committedIndex}
          offscreenPageLimit={1}
          scrollEnabled={scrollEnabled}
          keyboardDismissMode="none"
          onPageScroll={onPageScroll}
          onPageSelected={onPageSelectedNative}
          onPageScrollStateChanged={onPageScrollStateChanged}
        >
          {pages.map((page, index) => {
            const active = index === committedIndex && !isTransitioning;
            return (
              <View
                key={page.key}
                collapsable={false}
                style={styles.page}
                pointerEvents={active ? 'auto' : 'none'}
                accessibilityElementsHidden={!active}
                importantForAccessibility={active ? 'auto' : 'no-hide-descendants'}
              >
                {mountedIndices.has(index) || index === committedIndex ? page.render() : null}
              </View>
            );
          })}
        </AnimatedPagerView>
      </GestureDetector>
    </PrimaryPageGestureProvider>
  );
}

const styles = StyleSheet.create({
  pager: { flex: 1 },
  page: { width: '100%', height: '100%' },
});
