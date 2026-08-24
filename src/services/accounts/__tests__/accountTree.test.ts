import {
  collectAccountDescendantIds,
  createAccountTreeSnapshot,
  planAccountTreeBulkMove,
  planAccountTreeMove,
  planAccountTreePlacementChange,
  validateAccountTreeStructure,
  validateAccountTreeMove,
} from '../accountTree';

const accounts = [
  { id: 'root-a' as never, orderNum: 8 },
  { id: 'root-b' as never, orderNum: 20 },
  { id: 'child-a' as never, parentAccountId: 'root-a' as never, orderNum: 5 },
  { id: 'child-b' as never, parentAccountId: 'root-a' as never, orderNum: 9 },
];

describe('planAccountTreeMove', () => {
  it('interprets siblingIndex as the final position for same-parent moves', () => {
    const result = planAccountTreeMove(accounts, {
      accountId: 'child-a' as never,
      parentId: 'root-a' as never,
      siblingIndex: 1,
    });

    expect(result.get('child-b' as never)).toEqual({ parentAccountId: 'root-a', orderNum: 0 });
    expect(result.get('child-a' as never)).toEqual({ parentAccountId: 'root-a', orderNum: 1 });
  });

  it('normalizes both sibling lists when moving between parents', () => {
    const result = planAccountTreeMove(accounts, {
      accountId: 'child-a' as never,
      parentId: null,
      siblingIndex: 1,
    });

    expect(result.get('child-a' as never)).toEqual({ parentAccountId: undefined, orderNum: 1 });
    expect(result.get('root-b' as never)).toEqual({ parentAccountId: undefined, orderNum: 2 });
    expect(result.get('child-b' as never)).toEqual({ parentAccountId: 'root-a', orderNum: 0 });
  });

  it('keeps descendants intact and exposes them for cycle validation', () => {
    expect(collectAccountDescendantIds(accounts, 'root-a' as never)).toEqual(
      new Set(['child-a', 'child-b']),
    );
  });

  it('keeps root ordering scoped to account type', () => {
    const result = planAccountTreeMove(
      [
        { id: 'asset-a' as never, accountType: 'ASSET', orderNum: 0 },
        { id: 'asset-b' as never, accountType: 'ASSET', orderNum: 1 },
        { id: 'liability-a' as never, accountType: 'LIABILITY', orderNum: 0 },
      ],
      {
        accountId: 'asset-b' as never,
        parentId: null,
        siblingIndex: 0,
      },
    );

    expect(result.get('asset-a' as never)).toEqual({ parentAccountId: undefined, orderNum: 1 });
    expect(result.get('asset-b' as never)).toEqual({ parentAccountId: undefined, orderNum: 0 });
    expect(result.has('liability-a' as never)).toBe(false);
  });
});

describe('planAccountTreePlacementChange', () => {
  it('normalizes the old and new type-scoped root lists during a type change', () => {
    const result = planAccountTreePlacementChange(
      [
        { id: 'asset-a' as never, accountType: 'ASSET', orderNum: 0 },
        { id: 'asset-b' as never, accountType: 'ASSET', orderNum: 1 },
        { id: 'liability-a' as never, accountType: 'LIABILITY', orderNum: 0 },
      ],
      {
        accountId: 'asset-a' as never,
        parentId: null,
        siblingIndex: 1,
        nextAccountType: 'LIABILITY',
      },
    );

    expect(result).toEqual(
      new Map([
        ['asset-b', { parentAccountId: undefined, orderNum: 0 }],
        ['asset-a', { parentAccountId: undefined, orderNum: 1 }],
      ]),
    );
  });
});

describe('createAccountTreeSnapshot', () => {
  it('provides ordered roots, children, leaves, descendants and safe parent candidates', () => {
    const snapshot = createAccountTreeSnapshot([
      { id: 'asset-root' as never, accountType: 'ASSET', orderNum: 1, name: 'Root' },
      {
        id: 'asset-leaf' as never,
        accountType: 'ASSET',
        parentAccountId: 'asset-root' as never,
        orderNum: 0,
        name: 'Leaf',
      },
      { id: 'asset-other' as never, accountType: 'ASSET', orderNum: 0, name: 'Other' },
      { id: 'liability-root' as never, accountType: 'LIABILITY', orderNum: 0, name: 'Liability' },
      {
        id: 'archived' as never,
        accountType: 'ASSET',
        orderNum: 2,
        archivedAt: new Date(),
        name: 'Archived',
      },
    ]);

    expect(snapshot.rootsByType.get('ASSET')).toEqual(['asset-other', 'asset-root', 'archived']);
    expect(snapshot.childrenByParent.get('asset-root' as never)).toEqual(['asset-leaf']);
    expect(snapshot.leafAccountIds).toEqual(
      new Set(['asset-leaf', 'asset-other', 'liability-root', 'archived']),
    );
    expect(snapshot.getDescendants('asset-root' as never)).toEqual(new Set(['asset-leaf']));
    expect(snapshot.getParentCandidates('asset-root' as never).map(account => account.id)).toEqual([
      'asset-other',
    ]);
  });
});

describe('bulk account tree moves', () => {
  it('preserves selected sibling order and normalizes the destination list', () => {
    const result = planAccountTreeBulkMove(
      [
        { id: 'a' as never, accountType: 'ASSET', orderNum: 0 },
        { id: 'b' as never, accountType: 'ASSET', orderNum: 1 },
        { id: 'c' as never, accountType: 'ASSET', orderNum: 2 },
        { id: 'd' as never, accountType: 'ASSET', orderNum: 3 },
      ],
      ['c' as never, 'a' as never],
      { parentId: null, siblingIndex: 1 },
    );

    expect(result).toEqual(
      new Map([
        ['a', { parentAccountId: undefined, orderNum: 1 }],
        ['b', { parentAccountId: undefined, orderNum: 0 }],
      ]),
    );
  });

  it('rejects cross-type and archived destinations before planning', () => {
    const accounts = [
      { id: 'asset' as never, accountType: 'ASSET', orderNum: 0 },
      { id: 'liability' as never, accountType: 'LIABILITY', orderNum: 0 },
      { id: 'archived' as never, accountType: 'ASSET', orderNum: 1, archivedAt: new Date() },
    ];
    expect(() =>
      validateAccountTreeMove(accounts, {
        accountId: 'asset' as never,
        parentId: 'liability' as never,
        siblingIndex: 0,
      }),
    ).toThrow('same account type');
    expect(() =>
      validateAccountTreeMove(accounts, {
        accountId: 'asset' as never,
        parentId: 'archived' as never,
        siblingIndex: 0,
      }),
    ).toThrow('Archived accounts cannot have new children');
  });
});

describe('validateAccountTreeStructure', () => {
  it('accepts arbitrary-depth forests', () => {
    expect(() =>
      validateAccountTreeStructure([
        { id: 'root' as never, accountType: 'ASSET' },
        { id: 'child' as never, parentAccountId: 'root' as never, accountType: 'ASSET' },
        { id: 'grandchild' as never, parentAccountId: 'child' as never, accountType: 'ASSET' },
      ]),
    ).not.toThrow();
  });

  it.each([
    [
      'missing parent',
      [{ id: 'child' as never, parentAccountId: 'missing' as never, accountType: 'ASSET' }],
    ],
    [
      'deleted parent',
      [
        { id: 'parent' as never, accountType: 'ASSET', deletedAt: new Date() },
        { id: 'child' as never, parentAccountId: 'parent' as never, accountType: 'ASSET' },
      ],
    ],
    [
      'cross-type parent',
      [
        { id: 'parent' as never, accountType: 'ASSET' },
        { id: 'child' as never, parentAccountId: 'parent' as never, accountType: 'LIABILITY' },
      ],
    ],
    [
      'cycle',
      [
        { id: 'a' as never, parentAccountId: 'b' as never, accountType: 'ASSET' },
        { id: 'b' as never, parentAccountId: 'a' as never, accountType: 'ASSET' },
      ],
    ],
  ])('rejects %s', (_label, accounts) => {
    expect(() => validateAccountTreeStructure(accounts)).toThrow();
  });

  it.each([
    [
      'duplicate sibling positions',
      [
        { id: 'a' as never, accountType: 'ASSET', orderNum: 0 },
        { id: 'b' as never, accountType: 'ASSET', orderNum: 0 },
      ],
    ],
    [
      'gapped sibling positions',
      [
        { id: 'a' as never, accountType: 'ASSET', orderNum: 0 },
        { id: 'b' as never, accountType: 'ASSET', orderNum: 2 },
      ],
    ],
  ])('rejects %s', (_label, accounts) => {
    expect(() => validateAccountTreeStructure(accounts)).toThrow(
      'Sibling order must be contiguous',
    );
  });
});
