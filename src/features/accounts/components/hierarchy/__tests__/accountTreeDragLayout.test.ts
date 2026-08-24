import type { AccountId } from '@/src/types/ids';
import type { FlattenedAccountTreeRow } from '@/src/services/accounts/accountTreeProjection';
import {
  getAccountTreeDragContentYFromGeometry,
  getAccountTreeAutoScrollVelocity,
  getAccountTreeDragContentY,
  projectAccountTreeDragLayout,
  resolveAccountTreeVisualHover,
} from '../accountTreeDragLayout';
import { shouldDispatchAccountTreeDragUpdate } from '../AccountManagementTreeRow';

const id = (value: string) => value as AccountId;

function row(value: string, depth = 0): FlattenedAccountTreeRow {
  return {
    accountId: id(value),
    depth,
    childCount: 0,
    isExpanded: false,
  };
}

describe('projectAccountTreeDragLayout', () => {
  it('removes the first row from its original slot while it is dragged down', () => {
    const rows = [row('first'), row('second'), row('third'), row('fourth')];

    const layout = projectAccountTreeDragLayout(
      rows,
      id('first'),
      { hoveredAccountId: id('fourth'), kind: 'sibling-after' },
      76,
    );

    expect(layout.rows.map(item => item.accountId)).toEqual(['second', 'third', 'fourth', 'first']);
    expect(layout.activeTranslationAdjustment).toBe(228);
  });

  it('moves a visible subtree as one block without leaving its source rows behind', () => {
    const rows = [row('parent'), row('child', 1), row('third'), row('fourth')];

    const layout = projectAccountTreeDragLayout(
      rows,
      id('parent'),
      { hoveredAccountId: id('fourth'), kind: 'sibling-after' },
      76,
    );

    expect(layout.rows.map(item => item.accountId)).toEqual(['third', 'fourth', 'parent', 'child']);
    expect(layout.activeTranslationAdjustment).toBe(152);
  });

  it('uses measured row heights for displacement', () => {
    const rows = [row('first'), row('second'), row('third')];
    const heights = new Map([
      [id('first'), 88],
      [id('second'), 72],
      [id('third'), 56],
    ]);

    const layout = projectAccountTreeDragLayout(
      rows,
      id('first'),
      { hoveredAccountId: id('third'), kind: 'sibling-after' },
      heights,
    );

    expect(layout.activeTranslationAdjustment).toBe(128);
  });

  it('keeps the type header before the first account after reordering it', () => {
    const rows: FlattenedAccountTreeRow[] = [
      { ...row('cash'), accountType: 'ASSET', sectionLabel: 'Assets' },
      { ...row('bank'), accountType: 'ASSET' },
      { ...row('opening'), accountType: 'EQUITY', sectionLabel: 'Equity' },
    ];

    const layout = projectAccountTreeDragLayout(
      rows,
      id('cash'),
      { hoveredAccountId: id('bank'), kind: 'sibling-after' },
      76,
    );

    expect(layout.rows.map(item => [item.accountId, item.sectionLabel])).toEqual([
      [id('bank'), 'Assets'],
      [id('cash'), undefined],
      [id('opening'), 'Equity'],
    ]);
  });

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
});

describe('getAccountTreeDragContentY', () => {
  it('uses the source row content coordinate without a scroll offset', () => {
    expect(getAccountTreeDragContentY(4, 56, 56)).toBe(4 * 56 + 56 + 28);
  });

  it('adds only scrolling performed after the drag began', () => {
    expect(getAccountTreeDragContentY(4, 56, 56, 84)).toBe(4 * 56 + 56 + 84 + 28);
  });

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
        { translationY: 4, absoluteY: 104 },
      ),
    ).toBe(true);
  });

  it('coalesces sub-threshold movement without changing drop geometry', () => {
    expect(
      shouldDispatchAccountTreeDragUpdate(
        { translationY: 20, absoluteY: 120 },
        { translationY: 23, absoluteY: 123 },
      ),
    ).toBe(false);
  });
});
