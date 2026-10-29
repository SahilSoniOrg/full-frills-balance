import { useCallback, useEffect, useRef } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import PagerView, {
  type PageScrollStateChangedNativeEventData,
  type PagerViewOnPageScrollEvent,
} from 'react-native-pager-view';
import Animated, { runOnJS, useEvent } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import type { PrimaryPagerViewportProps } from './PrimaryPagerViewport.types';
import { PrimaryPagerPageContent } from './PrimaryPagerPageContent';

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

/** Fraction of page width pulled past the leading edge before the drawer opens. */
const LEADING_OVERSCROLL_OPEN = -0.14;

function writePageProgress(progress: SharedValue<number>, value: number) {
  'worklet';
  progress.value = value;
}

export function PrimaryPagerViewport({
  pages,
  committedIndex,
  mountedIndices,
  isTransitioning: _isTransitioning,
  reduceMotion,
  scrollEnabled,
  pageProgress,
  onPageSelected,
  onTransitioningChange,
  onLeadingOverscrollOpen,
}: PrimaryPagerViewportProps) {
  const pagerRef = useRef<PagerView>(null);
  const committedIndexRef = useRef(committedIndex);
  const renderedIndexRef = useRef(committedIndex);
  const pendingUserIndexRef = useRef<number | null>(null);
  const programmaticTargetRef = useRef<number | null>(null);
  const userGestureRef = useRef(false);
  const gestureEpochRef = useRef(0);
  const leadingOverscrollRef = useRef(0);
  const leadingOpenArmedRef = useRef(false);
  const leadingOverscrollEnabledRef = useRef(false);
  const onLeadingOverscrollOpenRef = useRef(onLeadingOverscrollOpen);
  const pageCount = pages.length;
  const leadingOverscrollEnabled =
    Platform.OS === 'ios' && committedIndex === 0 && scrollEnabled && !!onLeadingOverscrollOpen;

  useEffect(() => {
    onLeadingOverscrollOpenRef.current = onLeadingOverscrollOpen;
  }, [onLeadingOverscrollOpen]);

  useEffect(() => {
    leadingOverscrollEnabledRef.current = leadingOverscrollEnabled;
  }, [leadingOverscrollEnabled]);

  const resetLeadingOverscroll = useCallback(() => {
    leadingOverscrollRef.current = 0;
    leadingOpenArmedRef.current = false;
  }, []);

  const deliverLeadingOverscroll = useCallback((offset: number) => {
    if (!leadingOverscrollEnabledRef.current || !userGestureRef.current) return;
    leadingOverscrollRef.current = Math.min(leadingOverscrollRef.current, offset);
    if (!leadingOpenArmedRef.current && offset <= LEADING_OVERSCROLL_OPEN) {
      leadingOpenArmedRef.current = true;
      onLeadingOverscrollOpenRef.current?.();
    }
  }, []);

  const onPageScroll = useEvent<PagerViewOnPageScrollEvent>(
    event => {
      'worklet';
      const raw = event.position + event.offset;
      const position = Math.min(Math.max(raw, 0), pageCount - 1);
      writePageProgress(pageProgress, position);
      if (event.position <= 0 && event.offset < 0) {
        runOnJS(deliverLeadingOverscroll)(event.offset);
      }
    },
    ['onPageScroll'],
  );

  useEffect(() => {
    if (renderedIndexRef.current === committedIndex) return;
    renderedIndexRef.current = committedIndex;
    committedIndexRef.current = committedIndex;

    // Finger swipe already moved the pager — just clear the pending flag.
    if (pendingUserIndexRef.current === committedIndex) {
      pendingUserIndexRef.current = null;
      programmaticTargetRef.current = null;
      onTransitioningChange(false);
      return;
    }

    userGestureRef.current = false;
    gestureEpochRef.current += 1;
    resetLeadingOverscroll();
    if (reduceMotion) {
      // Keep finger-driven paging native; only remove travel from route changes.
      programmaticTargetRef.current = null;
      pagerRef.current?.setPageWithoutAnimation(committedIndex);
      writePageProgress(pageProgress, committedIndex);
      onTransitioningChange(false);
      return;
    }

    // Tab / Back / deep-link: animate the pan so it matches finger swipes.
    programmaticTargetRef.current = committedIndex;
    onTransitioningChange(true);
    pagerRef.current?.setPage(committedIndex);
  }, [committedIndex, onTransitioningChange, pageProgress, reduceMotion, resetLeadingOverscroll]);

  useEffect(() => {
    if (scrollEnabled) return;
    if (userGestureRef.current || pendingUserIndexRef.current !== null) {
      userGestureRef.current = false;
      pendingUserIndexRef.current = null;
      gestureEpochRef.current += 1;
      programmaticTargetRef.current = committedIndexRef.current;
      resetLeadingOverscroll();
      pagerRef.current?.setPageWithoutAnimation(committedIndexRef.current);
      writePageProgress(pageProgress, committedIndexRef.current);
      onTransitioningChange(false);
    }
  }, [scrollEnabled, pageProgress, onTransitioningChange, resetLeadingOverscroll]);

  const onPageSelectedNative = (event: { nativeEvent: { position: number } }) => {
    const index = event.nativeEvent.position;
    if (programmaticTargetRef.current === index) {
      programmaticTargetRef.current = null;
      return;
    }
    // Native selection can arrive after idle, especially while JS is busy.
    // Programmatic events are filtered above; do not discard a real selection
    // merely because the idle callback has already cleared the gesture flag.
    if (!scrollEnabled || index === committedIndexRef.current) return;

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
      resetLeadingOverscroll();
      onTransitioningChange(scrollEnabled);
      return;
    }
    if (scrollState === 'settling') {
      // Keep the transition lock through the animated settle (finger or setPage).
      onTransitioningChange(true);
      return;
    }
    if (scrollState !== 'idle') return;

    if (
      leadingOverscrollEnabledRef.current &&
      !leadingOpenArmedRef.current &&
      leadingOverscrollRef.current <= LEADING_OVERSCROLL_OPEN
    ) {
      onLeadingOverscrollOpenRef.current?.();
    }
    resetLeadingOverscroll();

    const epoch = gestureEpochRef.current;
    onTransitioningChange(false);
    requestAnimationFrame(() => {
      if (gestureEpochRef.current !== epoch || pendingUserIndexRef.current !== null) return;
      userGestureRef.current = false;
      writePageProgress(pageProgress, committedIndexRef.current);
    });
  };

  return (
    <AnimatedPagerView
      ref={pagerRef}
      style={styles.pager}
      initialPage={committedIndex}
      // Retain only the immediate neighbors for native paging.
      offscreenPageLimit={1}
      scrollEnabled={scrollEnabled}
      // iOS only: rubber-band past Dashboard so a mid-screen LTR can open the drawer
      // without full-width drawer hitSlop (which starved native RTL paging).
      overdrag={leadingOverscrollEnabled}
      keyboardDismissMode="none"
      onPageScroll={onPageScroll}
      onPageSelected={onPageSelectedNative}
      onPageScrollStateChanged={onPageScrollStateChanged}
    >
      {pages.map((page, index) => {
        // Do not tie pointerEvents / a11y to isTransitioning: flipping them at
        // drag-start makes ScrollView/FlashList jump on the page sliding away.
        const isCommitted = index === committedIndex;
        return (
          <View
            // Route name, not route.key: placeholders use key===name until first
            // visit, then navigation mints a new key — remounting mid-pan feels
            // like opening a fresh screen instead of sliding.
            key={page.name}
            collapsable={false}
            style={styles.page}
            pointerEvents={isCommitted ? 'auto' : 'none'}
            accessibilityElementsHidden={!isCommitted}
            importantForAccessibility={isCommitted ? 'auto' : 'no-hide-descendants'}
          >
            {mountedIndices.has(index) || isCommitted ? (
              <PrimaryPagerPageContent page={page} />
            ) : null}
          </View>
        );
      })}
    </AnimatedPagerView>
  );
}

const styles = StyleSheet.create({
  pager: { flex: 1 },
  page: { width: '100%', height: '100%' },
});
