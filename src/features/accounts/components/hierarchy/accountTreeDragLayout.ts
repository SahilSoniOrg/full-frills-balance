import { Spacing, Typography } from '@/src/constants';
import type { AccountId } from '@/src/types/ids';
import type { FlattenedAccountTreeRow } from '@/src/services/accounts/accountTreeProjection';
import type { AccountTreeDropKind } from '@/src/services/accounts/accountTreeTargets';

export const ACCOUNT_TREE_ROW_MIN_HEIGHT = 56;
export const ACCOUNT_TREE_SECTION_HEADER_HEIGHT =
  Spacing.lg + Math.round(Typography.sizes.xs * Typography.lineHeights.tight) + Spacing.sm;

export interface AccountTreeVisualHover {
  hoveredAccountId: AccountId;
  kind: AccountTreeDropKind;
}

export type AccountTreeRowHeightSource = number | ReadonlyMap<AccountId, number>;

export interface AccountTreeDragDisplacements {
  activeSubtreeAccountIds: ReadonlySet<AccountId>;
  /** translateY for non-active rows that make room for the landing slot */
  displacements: ReadonlyMap<AccountId, number>;
  /** Content-space offset from the origin slot to the landing gap */
  settleTranslationY: number;
}

function resolveRowHeight(
  row: FlattenedAccountTreeRow,
  source: AccountTreeRowHeightSource,
): number {
  return typeof source === 'number'
    ? source
    : (source.get(row.accountId) ?? ACCOUNT_TREE_ROW_MIN_HEIGHT);
}

function getRowTop(
  rows: readonly FlattenedAccountTreeRow[],
  index: number,
  heights: AccountTreeRowHeightSource,
): number {
  let top = 0;
  for (let rowIndex = 0; rowIndex < index; rowIndex += 1) {
    const row = rows[rowIndex];
    if (row) top += resolveRowHeight(row, heights);
  }
  return top;
}

export function getAccountTreeRowGeometry(
  rows: readonly FlattenedAccountTreeRow[],
  accountId: AccountId,
  heights: AccountTreeRowHeightSource,
): { top: number; height: number } | null {
  const index = rows.findIndex(row => row.accountId === accountId);
  const row = rows[index];
  if (!row) return null;
  return { top: getRowTop(rows, index, heights), height: resolveRowHeight(row, heights) };
}

export function getAccountTreeDragContentYFromGeometry(
  sourceTop: number,
  sourceHeight: number,
  translationY: number,
  scrollDelta = 0,
): number {
  return sourceTop + sourceHeight / 2 + translationY + scrollDelta;
}

export function getAccountTreeAutoScrollVelocity(
  pointerY: number,
  viewportTop: number,
  viewportHeight: number,
  edgeSize: number,
  maxSpeed: number,
): number {
  if (viewportHeight <= 0 || edgeSize <= 0 || maxSpeed <= 0) return 0;
  const localY = pointerY - viewportTop;
  if (localY < edgeSize) {
    return -maxSpeed * Math.min(1, (edgeSize - localY) / edgeSize);
  }
  const bottomEdge = viewportHeight - edgeSize;
  if (localY > bottomEdge) {
    return maxSpeed * Math.min(1, (localY - bottomEdge) / edgeSize);
  }
  return 0;
}

function getDisplayedSubtreeEnd(
  rows: readonly FlattenedAccountTreeRow[],
  startIndex: number,
): number {
  const root = rows[startIndex];
  if (!root) return startIndex;
  let endIndex = startIndex + 1;
  while (endIndex < rows.length && (rows[endIndex]?.depth ?? -1) > root.depth) {
    endIndex += 1;
  }
  return endIndex;
}

function getAccountTreeDragBoundaryIndex(
  rows: readonly FlattenedAccountTreeRow[],
  hover: AccountTreeVisualHover,
  hoveredIndex: number,
): number {
  return hover.kind === 'child' || hover.kind === 'outside'
    ? getDisplayedSubtreeEnd(rows, hoveredIndex)
    : hoveredIndex + (hover.kind === 'sibling-after' ? 1 : 0);
}

/** Insertion boundary used for make-room / settle — stable key for haptic + thrash guards. */
export function getAccountTreeDragInsertionKey(
  rows: readonly FlattenedAccountTreeRow[],
  hover: AccountTreeVisualHover | null,
): string | null {
  if (!hover) return null;
  const hoveredIndex = rows.findIndex(row => row.accountId === hover.hoveredAccountId);
  if (hoveredIndex < 0) return null;
  return String(getAccountTreeDragBoundaryIndex(rows, hover, hoveredIndex));
}

export interface ResolveAccountTreeVisualHoverOptions {
  /** Rows to ignore (usually the lifted subtree sitting over its origin slot). */
  skipAccountIds?: ReadonlySet<AccountId>;
  /** Prior hover — used for sticky zone hysteresis so make-room doesn't thrash. */
  previous?: AccountTreeVisualHover | null;
}

const ZONE_BEFORE_ENTER = 0.28;
const ZONE_BEFORE_EXIT = 0.36;
const ZONE_AFTER_ENTER = 0.72;
const ZONE_AFTER_EXIT = 0.64;
const ZONE_MID = 0.5;

/**
 * Resolves drop intent from the flattened source tree. Expanded parents expose
 * distinct before / child / outside slots; sticky zones prevent make-room thrash.
 */
export function resolveAccountTreeVisualHover(
  rows: readonly FlattenedAccountTreeRow[],
  contentY: number,
  rowHeights: AccountTreeRowHeightSource,
  canReceiveChildren: (accountId: AccountId) => boolean,
  options: ResolveAccountTreeVisualHoverOptions = {},
): AccountTreeVisualHover | null {
  if (rows.length === 0) return null;
  const skipAccountIds = options.skipAccountIds;
  const previous = options.previous ?? null;

  let hoveredIndex = 0;
  let hoveredTop = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const candidate = rows[index];
    if (!candidate) continue;
    const height = resolveRowHeight(candidate, rowHeights);
    hoveredIndex = index;
    if (contentY < hoveredTop + height || index === rows.length - 1) break;
    hoveredTop += height;
  }

  const hovered = rows[hoveredIndex];
  if (!hovered || skipAccountIds?.has(hovered.accountId)) return null;

  const rowHeight = resolveRowHeight(hovered, rowHeights);
  const relativeY = Math.max(0, Math.min(rowHeight, contentY - hoveredTop));
  const relativeRatio = rowHeight > 0 ? relativeY / rowHeight : 0;

  if (relativeRatio > ZONE_MID) {
    for (let index = hoveredIndex - 1; index >= 0; index -= 1) {
      const parent = rows[index];
      if (
        parent &&
        parent.childCount > 0 &&
        getDisplayedSubtreeEnd(rows, index) === hoveredIndex + 1
      ) {
        if (skipAccountIds?.has(parent.accountId)) return null;
        return { hoveredAccountId: parent.accountId, kind: 'outside' };
      }
    }
  }

  if (canReceiveChildren(hovered.accountId)) {
    const stickySame = previous?.hoveredAccountId === hovered.accountId;
    if (stickySame && previous.kind === 'sibling-before' && relativeRatio < ZONE_BEFORE_EXIT) {
      return { hoveredAccountId: hovered.accountId, kind: 'sibling-before' };
    }
    if (
      stickySame &&
      previous.kind === 'sibling-after' &&
      hovered.childCount === 0 &&
      relativeRatio > ZONE_AFTER_EXIT
    ) {
      return { hoveredAccountId: hovered.accountId, kind: 'sibling-after' };
    }
    if (
      stickySame &&
      previous.kind === 'child' &&
      relativeRatio >= ZONE_BEFORE_ENTER &&
      (hovered.childCount > 0 || relativeRatio <= ZONE_AFTER_ENTER)
    ) {
      return { hoveredAccountId: hovered.accountId, kind: 'child' };
    }
    if (relativeRatio < ZONE_BEFORE_ENTER) {
      return { hoveredAccountId: hovered.accountId, kind: 'sibling-before' };
    }
    if (hovered.childCount === 0 && relativeRatio > ZONE_AFTER_ENTER) {
      return { hoveredAccountId: hovered.accountId, kind: 'sibling-after' };
    }
    return { hoveredAccountId: hovered.accountId, kind: 'child' };
  }

  if (relativeRatio > ZONE_MID) {
    return { hoveredAccountId: hovered.accountId, kind: 'sibling-after' };
  }

  return { hoveredAccountId: hovered.accountId, kind: 'sibling-before' };
}

function emptyDisplacements(
  activeSubtreeAccountIds: ReadonlySet<AccountId> = new Set(),
): AccountTreeDragDisplacements {
  return { activeSubtreeAccountIds, displacements: new Map(), settleTranslationY: 0 };
}

/**
 * Keeps FlashList order stable and returns transform displacements so siblings
 * slide into a live gap while the active subtree floats under the finger.
 */
export function getAccountTreeDragDisplacements(
  rows: readonly FlattenedAccountTreeRow[],
  activeAccountId: AccountId | null,
  hover: AccountTreeVisualHover | null,
  rowHeights: AccountTreeRowHeightSource,
): AccountTreeDragDisplacements {
  if (!activeAccountId) return emptyDisplacements();

  const activeStart = rows.findIndex(row => row.accountId === activeAccountId);
  if (activeStart < 0) return emptyDisplacements();

  const activeEnd = getDisplayedSubtreeEnd(rows, activeStart);
  const activeSubtreeAccountIds = new Set(
    rows.slice(activeStart, activeEnd).map(row => row.accountId),
  );
  if (!hover) return emptyDisplacements(activeSubtreeAccountIds);

  const hoveredIndex = rows.findIndex(row => row.accountId === hover.hoveredAccountId);
  if (hoveredIndex < 0) return emptyDisplacements(activeSubtreeAccountIds);

  const boundaryIndex = getAccountTreeDragBoundaryIndex(rows, hover, hoveredIndex);
  if (boundaryIndex >= activeStart && boundaryIndex <= activeEnd) {
    return emptyDisplacements(activeSubtreeAccountIds);
  }

  const activeHeight =
    getRowTop(rows, activeEnd, rowHeights) - getRowTop(rows, activeStart, rowHeights);
  const displacements = new Map<AccountId, number>();

  if (boundaryIndex > activeEnd) {
    for (let index = activeEnd; index < boundaryIndex; index += 1) {
      const row = rows[index];
      if (row) displacements.set(row.accountId, -activeHeight);
    }
    return {
      activeSubtreeAccountIds,
      displacements,
      settleTranslationY:
        getRowTop(rows, boundaryIndex, rowHeights) - getRowTop(rows, activeEnd, rowHeights),
    };
  }

  for (let index = boundaryIndex; index < activeStart; index += 1) {
    const row = rows[index];
    if (row) displacements.set(row.accountId, activeHeight);
  }
  return {
    activeSubtreeAccountIds,
    displacements,
    settleTranslationY:
      getRowTop(rows, boundaryIndex, rowHeights) - getRowTop(rows, activeStart, rowHeights),
  };
}
