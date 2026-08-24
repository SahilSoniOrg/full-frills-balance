import {
  createAccountTreeDraft,
  discardAccountTreeDraft,
  getAccountTreeDraftPlacementChanges,
  stageAccountTreeDraftDrop,
} from '../accountTreeDraft';
import { createAccountTreeSnapshot } from '../accountTree';
import { resolveAccountTreeDropTarget, type AccountTreeDropKind } from '../accountTreeTargets';

const id = (value: string) => value as never;
const account = (idValue: string, orderNum: number, parentAccountId?: string, extra = {}) => ({
  id: id(idValue),
  accountType: 'ASSET',
  orderNum,
  parentAccountId: parentAccountId ? id(parentAccountId) : undefined,
  name: idValue,
  ...extra,
});
type TestAccount = ReturnType<typeof account>;

const tree = [
  account('cash', 0),
  account('travel', 1),
  account('trip-exchange', 0, 'travel'),
  account('trip-extras', 1, 'travel'),
  account('groceries', 2),
];

function target(
  draggedAccountId: string,
  hoveredAccountId: string,
  kind: AccountTreeDropKind,
  accounts: readonly TestAccount[] = tree,
) {
  const result = resolveAccountTreeDropTarget(
    accounts,
    id(draggedAccountId),
    id(hoveredAccountId),
    kind,
    { canReceiveChildren: () => true },
  );
  if (!result.target) throw new Error(result.reason || 'Expected a valid target');
  return result.target;
}

describe('resolveAccountTreeDropTarget', () => {
  it('resolves a child slot at arbitrary depth and preserves child order', () => {
    expect(target('trip-extras', 'travel', 'child')).toMatchObject({
      kind: 'child',
      parentId: 'travel',
      siblingIndex: 2,
    });
  });

  it('resolves an outside slot after the hovered parent at its own level', () => {
    expect(target('groceries', 'travel', 'outside')).toMatchObject({
      kind: 'outside',
      parentId: null,
      siblingIndex: 2,
      anchorAccountId: 'travel',
    });
  });

  it.each([
    ['self', 'travel', 'travel', 'child'],
    ['descendant', 'travel', 'trip-exchange', 'child'],
    ['archived', 'cash', 'travel', 'child'],
    ['wrongType', 'cash', 'travel', 'child'],
  ] as const)('rejects %s targets', (reason, draggedId, hoveredId, kind) => {
    const accounts =
      reason === 'archived'
        ? tree.map(item => (item.id === id('travel') ? { ...item, archivedAt: new Date() } : item))
        : reason === 'wrongType'
          ? tree.map(item =>
              item.id === id('travel') ? { ...item, accountType: 'LIABILITY' } : item,
            )
          : tree;
    const result = resolveAccountTreeDropTarget(accounts, id(draggedId), id(hoveredId), kind, {
      canReceiveChildren: () => true,
    });
    expect(result).toEqual({ target: null, reason });
  });

  it('rejects a parent that cannot receive children', () => {
    const result = resolveAccountTreeDropTarget(tree, id('cash'), id('travel'), 'child', {
      canReceiveChildren: accountValue => accountValue.id !== id('travel'),
    });

    expect(result).toEqual({ target: null, reason: 'cannot-receive-children' });
  });
});

describe('account tree draft', () => {
  it('composes a resolved same-parent drop against the post-removal sibling list', () => {
    const siblings = [account('a', 0), account('b', 1), account('c', 2)];
    const draft = stageAccountTreeDraftDrop(
      createAccountTreeDraft(siblings),
      target('a', 'b', 'sibling-after', siblings),
    );

    expect(
      createAccountTreeSnapshot(draft.accounts)
        .getChildren(null, 'ASSET')
        .map(item => item.id),
    ).toEqual([id('b'), id('a'), id('c')]);
  });

  it('stages a subtree move as one operation with affected descendants', () => {
    const draft = stageAccountTreeDraftDrop(
      createAccountTreeDraft(tree),
      target('travel', 'groceries', 'sibling-after'),
    );

    expect(
      createAccountTreeSnapshot(draft.accounts)
        .getChildren(null, 'ASSET')
        .map(item => item.id),
    ).toEqual([id('cash'), id('groceries'), id('travel')]);
    expect(draft.operations).toHaveLength(1);
    expect(draft.operations[0]).toMatchObject({
      accountId: id('travel'),
      affectedDescendantCount: 2,
    });
    expect(draft.placementChanges.size).toBeGreaterThan(0);
    expect(getAccountTreeDraftPlacementChanges(draft).get(id('travel'))).toEqual({
      parentAccountId: undefined,
      orderNum: 2,
    });
  });

  it('discards staged operations and resets the intentional count', () => {
    const draft = stageAccountTreeDraftDrop(
      createAccountTreeDraft(tree),
      target('trip-extras', 'travel', 'child'),
    );

    const discarded = discardAccountTreeDraft(draft);
    expect(discarded.accounts).toEqual(tree);
    expect(discarded.operations).toEqual([]);
    expect(discarded.placementChanges.size).toBe(0);
  });

  it('removes the draft when a later action returns the tree to baseline', () => {
    const initial = createAccountTreeDraft(tree);
    const moved = stageAccountTreeDraftDrop(initial, target('groceries', 'cash', 'sibling-before'));
    const restored = stageAccountTreeDraftDrop(
      moved,
      target('groceries', 'travel', 'sibling-after'),
    );

    expect(restored.accounts).toEqual(tree);
    expect(restored.operations).toEqual([]);
    expect(restored.placementChanges.size).toBe(0);
  });

  it('drops obsolete operation history when an account returns to baseline', () => {
    let draft = createAccountTreeDraft(tree);
    draft = stageAccountTreeDraftDrop(
      draft,
      target('cash', 'groceries', 'sibling-after', draft.accounts),
    );
    draft = stageAccountTreeDraftDrop(
      draft,
      target('travel', 'cash', 'sibling-after', draft.accounts),
    );
    draft = stageAccountTreeDraftDrop(
      draft,
      target('cash', 'groceries', 'sibling-before', draft.accounts),
    );

    expect(draft.operations.map(operation => operation.accountId)).toEqual([id('travel')]);
    expect(draft.placementChanges.has(id('cash'))).toBe(false);
  });
});
