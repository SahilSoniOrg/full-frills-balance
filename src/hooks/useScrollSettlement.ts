import { useCallback, useEffect, useRef } from 'react';
import type { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

const SCROLL_SETTLE_DELAY_MS = 120;
type ScrollEvent = NativeSyntheticEvent<NativeScrollEvent>;

/** Commits a user scroll at rest, including releases that produce no momentum events. */
export function useScrollSettlement(onSettle: (offset: { x: number; y: number }) => void) {
  const callbackRef = useRef(onSettle);
  const pendingRef = useRef(false);
  const draggingRef = useRef(false);
  const momentumRef = useRef(false);
  const offsetRef = useRef({ x: 0, y: 0 });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    callbackRef.current = onSettle;
  }, [onSettle]);

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);
  const cancel = useCallback(() => {
    clearTimer();
    pendingRef.current = false;
    draggingRef.current = false;
    momentumRef.current = false;
  }, [clearTimer]);
  const settle = useCallback(() => {
    clearTimer();
    if (!pendingRef.current) return;
    pendingRef.current = false;
    callbackRef.current(offsetRef.current);
  }, [clearTimer]);
  const schedule = useCallback(() => {
    clearTimer();
    timerRef.current = setTimeout(settle, SCROLL_SETTLE_DELAY_MS);
  }, [clearTimer, settle]);

  const onScrollBeginDrag = useCallback(
    (event: ScrollEvent) => {
      cancel();
      pendingRef.current = true;
      draggingRef.current = true;
      offsetRef.current = event.nativeEvent.contentOffset;
    },
    [cancel],
  );
  const onScroll = useCallback(
    (event: ScrollEvent) => {
      offsetRef.current = event.nativeEvent.contentOffset;
      if (pendingRef.current && !draggingRef.current && !momentumRef.current) schedule();
    },
    [schedule],
  );
  const onScrollEndDrag = useCallback(
    (event: ScrollEvent) => {
      draggingRef.current = false;
      offsetRef.current = event.nativeEvent.contentOffset;
      if (pendingRef.current) schedule();
    },
    [schedule],
  );
  const onMomentumScrollBegin = useCallback(() => {
    momentumRef.current = true;
    clearTimer();
  }, [clearTimer]);
  const onMomentumScrollEnd = useCallback(
    (event: ScrollEvent) => {
      momentumRef.current = false;
      offsetRef.current = event.nativeEvent.contentOffset;
      settle();
    },
    [settle],
  );
  useEffect(() => cancel, [cancel]);

  return {
    cancel,
    scrollProps: {
      onScrollBeginDrag,
      onScroll,
      onScrollEndDrag,
      onMomentumScrollBegin,
      onMomentumScrollEnd,
    },
  };
}
