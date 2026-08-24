import type { FlashListRef } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  View,
} from 'react-native';
import type { FlattenedAccountTreeRow } from '@/src/services/accounts/accountTreeProjection';
import {
  resolveAccountTreeDropTarget,
  type AccountTreeDropKind,
  type AccountTreeDropTarget,
} from '@/src/services/accounts/accountTreeTargets';
import type { AccountFields, AccountId } from '@/src/types/domain';
import { isAccountArchived } from '@/src/utils/accountArchive';
import { triggerHaptic } from '@/src/utils/haptics';
import {
  getAccountTreeAutoScrollVelocity,
  getAccountTreeDragContentYFromGeometry,
  getAccountTreeRowGeometry,
  projectAccountTreeDragLayout,
  resolveAccountTreeVisualHover,
} from './accountTreeDragLayout';
import { ACCOUNT_TREE_ROW_MIN_HEIGHT } from './AccountManagementTreeRow';

const AUTO_SCROLL_EDGE_SIZE = 72;
const AUTO_SCROLL_MAX_SPEED = 640;

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

export function useAccountTreeDragController({
  accounts,
  rows,
  balancesByAccountId,
  onDrop,
}: UseAccountTreeDragControllerOptions) {
  const [activeAccountId, setActiveAccountId] = useState<AccountId | null>(null);
  const [dragTranslation, setDragTranslation] = useState(0);
  const [dragScrollDelta, setDragScrollDelta] = useState(0);
  const [hover, setHover] = useState<AccountTreeHoverState | null>(null);
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
  const animationFrameRef = useRef<number | null>(null);
  const previousFrameTimeRef = useRef<number | null>(null);
  const updateHoverRef = useRef<(accountId: AccountId, translationY: number) => void>(() => {});
  const runAutoScrollFrameRef = useRef<(time: number) => void>(() => {});
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
  const dragLayout = projectAccountTreeDragLayout(rows, activeAccountId, hover, rowHeights);

  const onRowLayout = useCallback((accountId: AccountId, height: number) => {
    setMeasuredRowHeights(previous => {
      const previousHeight = previous.get(accountId);
      if (previousHeight != null && Math.abs(previousHeight - height) < 0.5) return previous;
      const next = new Map(previous);
      next.set(accountId, height);
      return next;
    });
  }, []);

  const beginDrag = useCallback((accountId: AccountId) => {
    activeAccountIdRef.current = accountId;
    initialScrollOffsetRef.current = scrollOffsetRef.current;
    dragTranslationRef.current = 0;
    pointerYRef.current = null;
    setActiveAccountId(accountId);
    setDragTranslation(0);
    setDragScrollDelta(0);
    hoverRef.current = null;
    setHover(null);
    listViewportRef.current?.measureInWindow((_x, y, _width, height) => {
      viewportRef.current = { top: y, height };
    });
  }, []);

  const updateHover = useCallback(
    (accountId: AccountId, translationY: number) => {
      const sourceGeometry = getAccountTreeRowGeometry(rows, accountId, rowHeights);
      if (!sourceGeometry) return;
      const contentY = getAccountTreeDragContentYFromGeometry(
        sourceGeometry.top,
        sourceGeometry.height,
        translationY,
        scrollOffsetRef.current - initialScrollOffsetRef.current,
      );
      const visualHover = resolveAccountTreeVisualHover(
        dragLayout.rows,
        contentY,
        rowHeights,
        candidateId => {
          const candidate = accountsById.get(candidateId);
          return candidate ? canReceiveChildren(candidate) : false;
        },
      );
      if (!visualHover || dragLayout.activeSubtreeAccountIds.has(visualHover.hoveredAccountId))
        return;
      const resolution = resolveAccountTreeDropTarget(
        accounts,
        accountId,
        visualHover.hoveredAccountId,
        visualHover.kind,
        { canReceiveChildren },
      );
      const nextHover = { ...visualHover, target: resolution.target };
      const previousKey = targetKey(hoverRef.current?.target ?? null);
      const nextKey = targetKey(nextHover.target);
      if (
        hoverRef.current?.hoveredAccountId === nextHover.hoveredAccountId &&
        hoverRef.current.kind === nextHover.kind &&
        previousKey === nextKey
      )
        return;
      if (nextKey && nextKey !== previousKey) void triggerHaptic('light');
      hoverRef.current = nextHover;
      setHover(nextHover);
    },
    [accounts, accountsById, canReceiveChildren, dragLayout, rowHeights, rows],
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

  const runAutoScrollFrame = useCallback((time: number) => {
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
    const nextOffset = Math.max(0, Math.min(maxOffset, currentOffset + velocity * elapsedSeconds));
    if (nextOffset !== currentOffset) {
      scrollOffsetRef.current = nextOffset;
      setDragScrollDelta(nextOffset - initialScrollOffsetRef.current);
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
  }, []);

  useEffect(() => {
    runAutoScrollFrameRef.current = runAutoScrollFrame;
  }, [runAutoScrollFrame]);
  const ensureAutoScroll = useCallback(() => {
    if (animationFrameRef.current == null)
      animationFrameRef.current = requestAnimationFrame(runAutoScrollFrame);
  }, [runAutoScrollFrame]);
  const updateDrag = useCallback(
    (accountId: AccountId, translationY: number, absoluteY: number) => {
      dragTranslationRef.current = translationY;
      pointerYRef.current = absoluteY;
      setDragTranslation(translationY);
      updateHover(accountId, translationY);
      ensureAutoScroll();
    },
    [ensureAutoScroll, updateHover],
  );
  const clearDrag = useCallback(() => {
    activeAccountIdRef.current = null;
    pointerYRef.current = null;
    setActiveAccountId(null);
    setDragTranslation(0);
    setDragScrollDelta(0);
    hoverRef.current = null;
    setHover(null);
  }, []);
  const finishDrag = useCallback(() => {
    stopAutoScroll();
    const target = hoverRef.current?.target;
    if (target) {
      onDrop(target);
      void triggerHaptic('medium');
    }
    clearDrag();
  }, [clearDrag, onDrop, stopAutoScroll]);
  const cancelDrag = useCallback(() => {
    stopAutoScroll();
    clearDrag();
  }, [clearDrag, stopAutoScroll]);
  useEffect(() => stopAutoScroll, [stopAutoScroll]);
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
    dragTranslation,
    dragScrollDelta,
    hover,
    dragLayout,
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
