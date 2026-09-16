import type { FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  View,
} from 'react-native';
import {
  runOnJS,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import type { FlattenedAccountTreeRow } from '@/src/services/accounts/accountTreeProjection';
import {
  resolveAccountTreeDropTarget,
  type AccountTreeDropKind,
  type AccountTreeDropTarget,
} from '@/src/services/accounts/accountTreeTargets';
import type { AccountFields } from '@/src/types/plainDtos';
import type { AccountId } from '@/src/types/ids';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { triggerHaptic } from '@/src/utils/haptics';
import {
  ACCOUNT_TREE_ROW_MIN_HEIGHT,
  ACCOUNT_TREE_SECTION_HEADER_HEIGHT,
  getAccountTreeAutoScrollVelocity,
  getAccountTreeDragContentYFromGeometry,
  getAccountTreeDragDisplacements,
  getAccountTreeDragInsertionKey,
  getAccountTreeRowGeometry,
  resolveAccountTreeVisualHover,
} from './accountTreeDragLayout';
import type { AccountTreeDragMotion } from './accountTreeDragMotion';
import {
  ACCOUNT_TREE_LAYOUT_EPSILON,
  ACCOUNT_TREE_SETTLE_LIFT_CANCEL_MS,
  ACCOUNT_TREE_SETTLE_LIFT_DROP_MS,
} from './accountTreeDragMotion';

export type { AccountTreeDragMotion };

const AUTO_SCROLL_EDGE_SIZE = 72;
const AUTO_SCROLL_MAX_SPEED = 640;
const DRAG_LIFT_SPRING = { damping: 18, stiffness: 280, mass: 0.7 };
const DRAG_SETTLE_SPRING = { damping: 24, stiffness: 340, mass: 0.7 };
const DROP_FLASH_MS = 700;

export interface AccountTreeHoverState {
  hoveredAccountId: AccountId;
  kind: AccountTreeDropKind;
  target: AccountTreeDropTarget | null;
}

interface UseAccountTreeDragControllerOptions {
  accounts: readonly AccountFields[];
  rows: readonly FlattenedAccountTreeRow[];
  balancesByAccountId: Map<string, { directTransactionCount?: number }>;
  onDrop: (target: AccountTreeDropTarget) => void;
}

function targetKey(target: AccountTreeDropTarget | null): string | null {
  return target
    ? `${target.accountId}:${target.parentId || 'root'}:${target.siblingIndex}:${target.kind}`
    : null;
}

function writeShared(value: SharedValue<number>, next: number) {
  value.value = next;
}

export function useAccountTreeDragController({
  accounts,
  rows,
  balancesByAccountId,
  onDrop,
}: UseAccountTreeDragControllerOptions) {
  const [activeAccountId, setActiveAccountId] = useState<AccountId | null>(null);
  const [hover, setHover] = useState<AccountTreeHoverState | null>(null);
  const [flashAccountId, setFlashAccountId] = useState<AccountId | null>(null);
  const [measuredRowHeights, setMeasuredRowHeights] = useState(() => new Map<AccountId, number>());
  const listRef = useRef<FlashListRef<FlattenedAccountTreeRow>>(null);
  const listViewportRef = useRef<View>(null);
  const scrollOffsetRef = useRef(0);
  const initialScrollOffsetRef = useRef(0);
  const contentHeightRef = useRef(0);
  const viewportRef = useRef({ top: 0, height: 0 });
  const activeAccountIdRef = useRef<AccountId | null>(null);
  const dragTranslationRef = useRef(0);
  const pointerYRef = useRef<number | null>(null);
  const hoverRef = useRef<AccountTreeHoverState | null>(null);
  const settlingRef = useRef(false);
  const settleTranslationRef = useRef(0);
  const animationFrameRef = useRef<number | null>(null);
  const previousFrameTimeRef = useRef<number | null>(null);
  const flashTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateHoverRef = useRef<(accountId: AccountId, translationY: number) => void>(() => {});
  const runAutoScrollFrameRef = useRef<(time: number) => void>(() => {});
  const clearDragRef = useRef<() => void>(() => {});

  const translationY = useSharedValue(0);
  const scrollDelta = useSharedValue(0);
  const liftProgress = useSharedValue(0);
  const [dragMotion] = useState<AccountTreeDragMotion>(() => ({
    translationY,
    scrollDelta,
    liftProgress,
  }));

  const accountsById = useMemo(
    () => new Map(accounts.map(account => [account.id, account] as const)),
    [accounts],
  );
  const rowHeights = useMemo(
    () =>
      new Map(
        rows.map(
          row =>
            [
              row.accountId,
              measuredRowHeights.get(row.accountId) ?? ACCOUNT_TREE_ROW_MIN_HEIGHT,
            ] as const,
        ),
      ),
    [measuredRowHeights, rows],
  );
  const canReceiveChildren = useCallback(
    (account: AccountFields) => {
      const balance = balancesByAccountId.get(account.id);
      return (
        !isAccountArchived(account) &&
        balance != null &&
        (balance.directTransactionCount || 0) === 0
      );
    },
    [balancesByAccountId],
  );
  const dragMotionLayout = getAccountTreeDragDisplacements(
    rows,
    activeAccountId,
    hover,
    rowHeights,
  );

  useEffect(() => {
    settleTranslationRef.current = dragMotionLayout.settleTranslationY;
  }, [dragMotionLayout.settleTranslationY]);

  const resetMotionValues = useCallback(
    (next: { translationY?: number; scrollDelta?: number; liftProgress?: number }) => {
      if (next.translationY != null) writeShared(translationY, next.translationY);
      if (next.scrollDelta != null) writeShared(scrollDelta, next.scrollDelta);
      if (next.liftProgress != null) writeShared(liftProgress, next.liftProgress);
    },
    [liftProgress, scrollDelta, translationY],
  );

  const onRowLayout = useCallback((accountId: AccountId, height: number) => {
    if (activeAccountIdRef.current != null || settlingRef.current) return;
    setMeasuredRowHeights(previous => {
      const previousHeight = previous.get(accountId);
      if (previousHeight != null && Math.abs(previousHeight - height) < ACCOUNT_TREE_LAYOUT_EPSILON)
        return previous;
      const next = new Map(previous);
      next.set(accountId, height);
      return next;
    });
  }, []);

  const clearHover = useCallback(() => {
    if (hoverRef.current == null) return;
    hoverRef.current = null;
    setHover(null);
  }, []);

  const beginDrag = useCallback(
    (accountId: AccountId) => {
      settlingRef.current = false;
      activeAccountIdRef.current = accountId;
      initialScrollOffsetRef.current = scrollOffsetRef.current;
      dragTranslationRef.current = 0;
      pointerYRef.current = null;
      resetMotionValues({ translationY: 0, scrollDelta: 0 });
      // eslint-disable-next-line react-hooks/immutability
      liftProgress.value = withSpring(1, DRAG_LIFT_SPRING);
      setActiveAccountId(accountId);
      clearHover();
      void triggerHaptic('medium');
      listViewportRef.current?.measureInWindow((_x, y, _width, height) => {
        viewportRef.current = { top: y, height };
      });
    },
    [clearHover, liftProgress, resetMotionValues],
  );

  const updateHover = useCallback(
    (accountId: AccountId, translationYValue: number) => {
      const sourceGeometry = getAccountTreeRowGeometry(rows, accountId, rowHeights);
      if (!sourceGeometry) return;
      const sourceRow = rows.find(row => row.accountId === accountId);
      const sourceHeaderHeight = sourceRow?.sectionLabel ? ACCOUNT_TREE_SECTION_HEADER_HEIGHT : 0;
      const sourceAccountHeight = Math.max(
        ACCOUNT_TREE_ROW_MIN_HEIGHT,
        sourceGeometry.height - sourceHeaderHeight,
      );
      const contentY = getAccountTreeDragContentYFromGeometry(
        sourceGeometry.top + sourceHeaderHeight,
        sourceAccountHeight,
        translationYValue,
        scrollOffsetRef.current - initialScrollOffsetRef.current,
      );
      const visualHover = resolveAccountTreeVisualHover(
        rows,
        contentY,
        rowHeights,
        candidateId => {
          const candidate = accountsById.get(candidateId);
          return candidate ? canReceiveChildren(candidate) : false;
        },
        {
          skipAccountIds: dragMotionLayout.activeSubtreeAccountIds,
          previous: hoverRef.current,
        },
      );
      if (!visualHover) {
        clearHover();
        return;
      }
      const draggedAccount = accountsById.get(accountId);
      const hoveredAccount = accountsById.get(visualHover.hoveredAccountId);
      if (
        draggedAccount &&
        hoveredAccount &&
        draggedAccount.accountType !== hoveredAccount.accountType
      ) {
        clearHover();
        return;
      }
      const resolution = resolveAccountTreeDropTarget(
        accounts,
        accountId,
        visualHover.hoveredAccountId,
        visualHover.kind,
        { canReceiveChildren },
      );
      const nextHover = { ...visualHover, target: resolution.target };
      if (
        hoverRef.current?.hoveredAccountId === nextHover.hoveredAccountId &&
        hoverRef.current.kind === nextHover.kind &&
        targetKey(hoverRef.current.target) === targetKey(nextHover.target)
      ) {
        return;
      }
      const previousInsertion = getAccountTreeDragInsertionKey(rows, hoverRef.current);
      const nextInsertion = getAccountTreeDragInsertionKey(rows, nextHover);
      if (nextInsertion && nextInsertion !== previousInsertion) void triggerHaptic('light');
      hoverRef.current = nextHover;
      setHover(nextHover);
    },
    [
      accounts,
      accountsById,
      canReceiveChildren,
      clearHover,
      dragMotionLayout.activeSubtreeAccountIds,
      rowHeights,
      rows,
    ],
  );

  useEffect(() => {
    updateHoverRef.current = updateHover;
  }, [updateHover]);

  const stopAutoScroll = useCallback(() => {
    if (animationFrameRef.current != null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    previousFrameTimeRef.current = null;
  }, []);

  const runAutoScrollFrame = useCallback(
    (time: number) => {
      animationFrameRef.current = null;
      const accountId = activeAccountIdRef.current;
      const pointerY = pointerYRef.current;
      if (!accountId || pointerY == null) {
        previousFrameTimeRef.current = null;
        return;
      }
      const { top, height } = viewportRef.current;
      const velocity = getAccountTreeAutoScrollVelocity(
        pointerY,
        top,
        height,
        AUTO_SCROLL_EDGE_SIZE,
        AUTO_SCROLL_MAX_SPEED,
      );
      const previousTime = previousFrameTimeRef.current ?? time;
      previousFrameTimeRef.current = time;
      const elapsedSeconds = Math.min(0.05, Math.max(0, time - previousTime) / 1000);
      const maxOffset = Math.max(0, contentHeightRef.current - height);
      const currentOffset = scrollOffsetRef.current;
      const nextOffset = Math.max(
        0,
        Math.min(maxOffset, currentOffset + velocity * elapsedSeconds),
      );
      if (nextOffset !== currentOffset) {
        scrollOffsetRef.current = nextOffset;
        writeShared(scrollDelta, nextOffset - initialScrollOffsetRef.current);
        listRef.current?.scrollToOffset({ offset: nextOffset, animated: false });
        updateHoverRef.current(accountId, dragTranslationRef.current);
      }
      const canContinue =
        velocity < 0 ? nextOffset > 0 : velocity > 0 ? nextOffset < maxOffset : false;
      if (canContinue)
        animationFrameRef.current = requestAnimationFrame(nextTime =>
          runAutoScrollFrameRef.current(nextTime),
        );
      else previousFrameTimeRef.current = null;
    },
    [scrollDelta],
  );

  useEffect(() => {
    runAutoScrollFrameRef.current = runAutoScrollFrame;
  }, [runAutoScrollFrame]);

  const ensureAutoScroll = useCallback(() => {
    if (animationFrameRef.current == null)
      animationFrameRef.current = requestAnimationFrame(runAutoScrollFrame);
  }, [runAutoScrollFrame]);

  const updateDrag = useCallback(
    (accountId: AccountId, translationYValue: number, absoluteY: number) => {
      if (settlingRef.current) return;
      dragTranslationRef.current = translationYValue;
      pointerYRef.current = absoluteY;
      writeShared(translationY, translationYValue);
      updateHover(accountId, translationYValue);
      ensureAutoScroll();
    },
    [ensureAutoScroll, translationY, updateHover],
  );

  const clearDrag = useCallback(() => {
    settlingRef.current = false;
    activeAccountIdRef.current = null;
    pointerYRef.current = null;
    dragTranslationRef.current = 0;
    resetMotionValues({ translationY: 0, scrollDelta: 0, liftProgress: 0 });
    setActiveAccountId(null);
    clearHover();
  }, [clearHover, resetMotionValues]);

  useEffect(() => {
    clearDragRef.current = clearDrag;
  }, [clearDrag]);

  const flashDroppedAccount = useCallback((accountId: AccountId) => {
    if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    setFlashAccountId(accountId);
    flashTimeoutRef.current = setTimeout(() => {
      setFlashAccountId(null);
      flashTimeoutRef.current = null;
    }, DROP_FLASH_MS);
  }, []);

  const settleTranslation = useCallback(
    (toValue: number, onSettled: () => void) => {
      settlingRef.current = true;
      pointerYRef.current = null;
      activeAccountIdRef.current = null;
      writeShared(scrollDelta, 0);
      // eslint-disable-next-line react-hooks/immutability
      liftProgress.value = withTiming(0, {
        duration:
          toValue === 0 ? ACCOUNT_TREE_SETTLE_LIFT_CANCEL_MS : ACCOUNT_TREE_SETTLE_LIFT_DROP_MS,
      });
      // eslint-disable-next-line react-hooks/immutability
      translationY.value = withSpring(toValue, DRAG_SETTLE_SPRING, finished => {
        if (finished) runOnJS(onSettled)();
      });
    },
    [liftProgress, scrollDelta, translationY],
  );

  const cancelDrag = useCallback(() => {
    stopAutoScroll();
    if (!activeAccountIdRef.current && !settlingRef.current) {
      clearDrag();
      return;
    }
    clearHover();
    settleTranslation(0, () => clearDragRef.current());
  }, [clearDrag, clearHover, settleTranslation, stopAutoScroll]);

  const finishDrag = useCallback(() => {
    stopAutoScroll();
    if (settlingRef.current) return;
    const target = hoverRef.current?.target;
    const droppedAccountId = activeAccountIdRef.current;
    if (!target || !droppedAccountId) {
      cancelDrag();
      return;
    }
    const settleTo = settleTranslationRef.current;
    void triggerHaptic('medium');
    settleTranslation(settleTo, () => {
      onDrop(target);
      flashDroppedAccount(droppedAccountId);
      clearDragRef.current();
    });
  }, [cancelDrag, flashDroppedAccount, onDrop, settleTranslation, stopAutoScroll]);

  useEffect(() => stopAutoScroll, [stopAutoScroll]);
  useEffect(
    () => () => {
      if (flashTimeoutRef.current) clearTimeout(flashTimeoutRef.current);
    },
    [],
  );

  const onListLayout = useCallback((event: LayoutChangeEvent) => {
    viewportRef.current = { ...viewportRef.current, height: event.nativeEvent.layout.height };
    listViewportRef.current?.measureInWindow((_x, y, _width, height) => {
      viewportRef.current = { top: y, height };
    });
  }, []);
  const onListScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
  }, []);

  return {
    activeAccountId,
    flashAccountId,
    dragMotion,
    hover,
    dragLayout: {
      rows,
      activeSubtreeAccountIds: dragMotionLayout.activeSubtreeAccountIds,
      displacements: dragMotionLayout.displacements,
    },
    listRef,
    listViewportRef,
    beginDrag,
    updateDrag,
    finishDrag,
    cancelDrag,
    onRowLayout,
    onListLayout,
    onListScroll,
    onContentSizeChange: (_width: number, height: number) => {
      contentHeightRef.current = height;
    },
  };
}
