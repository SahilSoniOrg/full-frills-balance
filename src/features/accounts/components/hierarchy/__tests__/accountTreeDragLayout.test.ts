import type { AccountId } from '@/src/types/ids';
import type { FlattenedAccountTreeRow } from '@/src/services/accounts/accountTreeProjection';
import {
  getAccountTreeDragContentYFromGeometry,
  getAccountTreeAutoScrollVelocity,
  getAccountTreeDragDisplacements,
  resolveAccountTreeVisualHover,
} from '../accountTreeDragLayout';
import { shouldDispatchAccountTreeDragUpdate } from '../accountTreeDragMotion';

const id = (value: string) => value as AccountId;

function row(value: string, depth = 0): FlattenedAccountTreeRow {
  return {
    accountId: id(value),
    depth,
    childCount: 0,
    isExpanded: false,
  };
}

describe('getAccountTreeDragDisplacements', () => {
  it('keeps the active subtree marked before the first hover resolve', () => {
    const rows = [row('first'), row('second'), row('third')];

    const layout = getAccountTreeDragDisplacements(rows, id('first'), null, 76);

    expect([...layout.activeSubtreeAccountIds]).toEqual([id('first')]);
    expect(layout.settleTranslationY).toBe(0);
    expect(layout.displacements.size).toBe(0);
  });

  it('shifts in-between rows up when dragging a block down', () => {
    const rows = [row('first'), row('second'), row('third'), row('fourth')];

    const result = getAccountTreeDragDisplacements(
      rows,
      id('first'),
      { hoveredAccountId: id('fourth'), kind: 'sibling-after' },
      76,
    );

    expect(result.displacements.get(id('second'))).toBe(-76);
    expect(result.displacements.get(id('third'))).toBe(-76);
    expect(result.displacements.get(id('fourth'))).toBe(-76);
    expect(result.displacements.has(id('first'))).toBe(false);
    expect(result.settleTranslationY).toBe(228);
  });

  it('shifts in-between rows down when dragging a block up', () => {
    const rows = [row('first'), row('second'), row('third'), row('fourth')];

    const result = getAccountTreeDragDisplacements(
      rows,
      id('fourth'),
      { hoveredAccountId: id('first'), kind: 'sibling-before' },
      76,
    );

    expect(result.displacements.get(id('first'))).toBe(76);
    expect(result.displacements.get(id('second'))).toBe(76);
    expect(result.displacements.get(id('third'))).toBe(76);
    expect(result.settleTranslationY).toBe(-228);
  });

  it('moves a visible subtree as one displacement height', () => {
    const rows = [row('parent'), row('child', 1), row('third'), row('fourth')];

    const result = getAccountTreeDragDisplacements(
      rows,
      id('parent'),
      { hoveredAccountId: id('fourth'), kind: 'sibling-after' },
      76,
    );

    expect(result.displacements.get(id('third'))).toBe(-152);
    expect(result.displacements.get(id('fourth'))).toBe(-152);
    expect(result.settleTranslationY).toBe(152);
  });

  it('uses measured row heights for settle distance', () => {
    const rows = [row('first'), row('second'), row('third')];
    const heights = new Map([
      [id('first'), 88],
      [id('second'), 72],
      [id('third'), 56],
    ]);

    const result = getAccountTreeDragDisplacements(
      rows,
      id('first'),
      { hoveredAccountId: id('third'), kind: 'sibling-after' },
      heights,
    );

    expect(result.settleTranslationY).toBe(128);
  });
});

describe('resolveAccountTreeVisualHover', () => {
  it('exposes before, child, and outside targets around an expanded parent', () => {
    const rows = [
      row('before'),
      row('parent'),
      row('first-child', 1),
      row('last-child', 1),
      row('after'),
    ];
    rows[1] = { ...rows[1], childCount: 2, isExpanded: true };

    expect(resolveAccountTreeVisualHover(rows, 56 + 8, 56, () => true)).toEqual({
      hoveredAccountId: id('parent'),
      kind: 'sibling-before',
    });
    expect(resolveAccountTreeVisualHover(rows, 56 + 28, 56, () => true)).toEqual({
      hoveredAccountId: id('parent'),
      kind: 'child',
    });
    expect(resolveAccountTreeVisualHover(rows, 56 * 3 + 36, 56, () => true)).toEqual({
      hoveredAccountId: id('parent'),
      kind: 'outside',
    });
  });

  it('uses the displayed subtree boundary after a preceding row is repositioned', () => {
    const rows = [row('before'), row('parent'), row('last-child', 1), row('after')];
    rows[1] = { ...rows[1], childCount: 1, isExpanded: true };

    expect(resolveAccountTreeVisualHover(rows, 56 * 2 + 36, 56, () => true)).toEqual({
      hoveredAccountId: id('parent'),
      kind: 'outside',
    });
  });

  it('exposes a child target for an eligible leaf', () => {
    const rows = [row('before'), row('eligible-leaf'), row('after')];

    expect(resolveAccountTreeVisualHover(rows, 56 + 28, 56, () => true)).toEqual({
      hoveredAccountId: id('eligible-leaf'),
      kind: 'child',
    });
  });

  it('resolves hover using measured variable row heights', () => {
    const rows = [row('before'), row('tall'), row('after')];
    const heights = new Map([
      [id('before'), 56],
      [id('tall'), 96],
      [id('after'), 56],
    ]);

    expect(resolveAccountTreeVisualHover(rows, 112, heights, () => true)).toEqual({
      hoveredAccountId: id('tall'),
      kind: 'child',
    });
  });

  it('keeps child intent sticky near the before/child boundary', () => {
    const rows = [row('before'), row('eligible-leaf'), row('after')];
    const previous = { hoveredAccountId: id('eligible-leaf'), kind: 'child' as const };

    expect(
      resolveAccountTreeVisualHover(rows, 56 + 56 * 0.3, 56, () => true, { previous }),
    ).toEqual({
      hoveredAccountId: id('eligible-leaf'),
      kind: 'child',
    });
  });

  it('skips the lifted subtree origin slot', () => {
    const rows = [row('first'), row('second'), row('third')];
    expect(
      resolveAccountTreeVisualHover(rows, 20, 56, () => true, {
        skipAccountIds: new Set([id('first')]),
      }),
    ).toBeNull();
  });
});

describe('getAccountTreeDragContentYFromGeometry', () => {
  it('uses measured source geometry', () => {
    expect(getAccountTreeDragContentYFromGeometry(72, 96, 12, 20)).toBe(152);
  });
});

describe('getAccountTreeAutoScrollVelocity', () => {
  it('stays still away from the viewport edges', () => {
    expect(getAccountTreeAutoScrollVelocity(300, 100, 500, 64, 600)).toBe(0);
  });

  it('accelerates toward either edge and caps its speed outside the viewport', () => {
    expect(getAccountTreeAutoScrollVelocity(132, 100, 500, 64, 600)).toBe(-300);
    expect(getAccountTreeAutoScrollVelocity(568, 100, 500, 64, 600)).toBe(300);
    expect(getAccountTreeAutoScrollVelocity(20, 100, 500, 64, 600)).toBe(-600);
    expect(getAccountTreeAutoScrollVelocity(680, 100, 500, 64, 600)).toBe(600);
  });
});

describe('shouldDispatchAccountTreeDragUpdate', () => {
  it('dispatches the first update and meaningful movement', () => {
    expect(shouldDispatchAccountTreeDragUpdate(null, { translationY: 0, absoluteY: 100 })).toBe(
      true,
    );
    expect(
      shouldDispatchAccountTreeDragUpdate(
        { translationY: 0, absoluteY: 100 },
        { translationY: 8, absoluteY: 108 },
      ),
    ).toBe(true);
  });

  it('coalesces sub-threshold movement without changing drop geometry', () => {
    expect(
      shouldDispatchAccountTreeDragUpdate(
        { translationY: 20, absoluteY: 120 },
        { translationY: 25, absoluteY: 125 },
      ),
    ).toBe(false);
  });

  it('dispatches once movement clears the hover coalesce threshold', () => {
    expect(
      shouldDispatchAccountTreeDragUpdate(
        { translationY: 20, absoluteY: 120 },
        { translationY: 28, absoluteY: 128 },
      ),
    ).toBe(true);
  });
});
