import type { AccountId } from '@/src/types/ids';
import type { FlattenedAccountTreeRow } from '@/src/services/accounts/accountTreeProjection';
import type { AccountTreeDropKind } from '@/src/services/accounts/accountTreeTargets';

export interface AccountTreeVisualHover {
  hoveredAccountId: AccountId;
  kind: AccountTreeDropKind;
}

export interface AccountTreeDragLayout {
  rows: readonly FlattenedAccountTreeRow[];
  activeSubtreeAccountIds: ReadonlySet<AccountId>;
  activeTranslationAdjustment: number;
}

export type AccountTreeRowHeightSource = number | ReadonlyMap<AccountId, number>;

const DEFAULT_ROW_HEIGHT = 56;

/**
 * Headers are rendered inside the first root row of each type. During a drag,
 * that first row can change, so rebuild the labels from the projected order.
 */
function normalizeSectionLabels(
  rows: readonly FlattenedAccountTreeRow[],
): FlattenedAccountTreeRow[] {
  const labelsByType = new Map<string, string>();
  for (const row of rows) {
    if (row.accountType && row.sectionLabel) labelsByType.set(row.accountType, row.sectionLabel);
  }

  const seenTypes = new Set<string>();
  return rows.map(row => {
    if (row.depth !== 0 || !row.accountType) return { ...row, sectionLabel: undefined };
    if (seenTypes.has(row.accountType)) return { ...row, sectionLabel: undefined };
    seenTypes.add(row.accountType);
    return { ...row, sectionLabel: labelsByType.get(row.accountType) };
  });
}

function resolveRowHeight(
  row: FlattenedAccountTreeRow,
  source: AccountTreeRowHeightSource,
): number {
  return typeof source === 'number' ? source : (source.get(row.accountId) ?? DEFAULT_ROW_HEIGHT);
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

export function getAccountTreeDragContentY(
  sourceIndex: number,
  translationY: number,
  rowHeight: number,
  scrollDelta = 0,
): number {
  // The source index is already in list-content coordinates. Gesture
  // translation is a delta, so scrolling changes the row's viewport position
  // but not the content-space insertion point.
  return sourceIndex * rowHeight + translationY + scrollDelta + rowHeight / 2;
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

/**
 * Resolves drop intent from the flattened, visible tree rather than treating a
 * parent as one ordinary row. The last visible child exposes the parent's
 * outside slot, so an expanded parent has distinct before / child / after
 * targets.
 */
export function resolveAccountTreeVisualHover(
  rows: readonly FlattenedAccountTreeRow[],
  contentY: number,
  rowHeights: AccountTreeRowHeightSource,
  canReceiveChildren: (accountId: AccountId) => boolean,
): AccountTreeVisualHover | null {
  if (rows.length === 0) return null;
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
  if (!hovered) return null;
  const rowHeight = resolveRowHeight(hovered, rowHeights);
  const relativeY = Math.max(0, Math.min(rowHeight, contentY - hoveredTop));

  if (relativeY > rowHeight * 0.5) {
    for (let index = hoveredIndex - 1; index >= 0; index -= 1) {
      const parent = rows[index];
      if (
        parent &&
        parent.childCount > 0 &&
        getDisplayedSubtreeEnd(rows, index) === hoveredIndex + 1
      ) {
        return { hoveredAccountId: parent.accountId, kind: 'outside' };
      }
    }
  }

  if (canReceiveChildren(hovered.accountId)) {
    if (relativeY < rowHeight * 0.28) {
      return { hoveredAccountId: hovered.accountId, kind: 'sibling-before' };
    }
    if (hovered.childCount === 0 && relativeY > rowHeight * 0.72) {
      return { hoveredAccountId: hovered.accountId, kind: 'sibling-after' };
    }
    return { hoveredAccountId: hovered.accountId, kind: 'child' };
  }

  if (relativeY > rowHeight * 0.5) {
    return { hoveredAccountId: hovered.accountId, kind: 'sibling-after' };
  }

  return { hoveredAccountId: hovered.accountId, kind: 'sibling-before' };
}

/**
 * Repositions the dragged visible subtree in the list itself. The active row
 * remains visually under the finger via the returned translation adjustment.
 * This deliberately avoids leaving an animated transform's empty source slot.
 */
export function projectAccountTreeDragLayout(
  rows: readonly FlattenedAccountTreeRow[],
  activeAccountId: AccountId | null,
  hover: AccountTreeVisualHover | null,
  rowHeights: AccountTreeRowHeightSource,
): AccountTreeDragLayout {
  if (!activeAccountId || !hover) {
    return { rows, activeSubtreeAccountIds: new Set(), activeTranslationAdjustment: 0 };
  }

  const activeStart = rows.findIndex(row => row.accountId === activeAccountId);
  const hoveredIndex = rows.findIndex(row => row.accountId === hover.hoveredAccountId);
  if (activeStart < 0 || hoveredIndex < 0) {
    return { rows, activeSubtreeAccountIds: new Set(), activeTranslationAdjustment: 0 };
  }

  const activeEnd = getDisplayedSubtreeEnd(rows, activeStart);
  const boundaryIndex =
    hover.kind === 'child' || hover.kind === 'outside'
      ? getDisplayedSubtreeEnd(rows, hoveredIndex)
      : hoveredIndex + (hover.kind === 'sibling-after' ? 1 : 0);
  const activeRows = rows.slice(activeStart, activeEnd);
  const activeSubtreeAccountIds = new Set(activeRows.map(row => row.accountId));

  if (boundaryIndex >= activeStart && boundaryIndex <= activeEnd) {
    return { rows, activeSubtreeAccountIds, activeTranslationAdjustment: 0 };
  }

  const rowsWithoutActiveSubtree = [...rows.slice(0, activeStart), ...rows.slice(activeEnd)];
  const insertionIndex =
    boundaryIndex < activeStart ? boundaryIndex : boundaryIndex - activeRows.length;
  const projectedRows = [
    ...rowsWithoutActiveSubtree.slice(0, insertionIndex),
    ...activeRows,
    ...rowsWithoutActiveSubtree.slice(insertionIndex),
  ];
  const normalizedProjectedRows = normalizeSectionLabels(projectedRows);

  const projectedActiveIndex = normalizedProjectedRows.findIndex(
    row => row.accountId === activeAccountId,
  );
  return {
    rows: normalizedProjectedRows,
    activeSubtreeAccountIds,
    activeTranslationAdjustment:
      getRowTop(projectedRows, projectedActiveIndex, rowHeights) -
      getRowTop(rows, activeStart, rowHeights),
  };
}
