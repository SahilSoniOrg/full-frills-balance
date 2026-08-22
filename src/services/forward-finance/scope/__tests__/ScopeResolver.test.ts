import { ScopeResolver } from '../ScopeResolver';

describe('ScopeResolver', () => {
  const accounts = [
    { id: 'root-expenses', parentAccountId: null },
    { id: 'food', parentAccountId: 'root-expenses' },
    { id: 'groceries', parentAccountId: 'food' },
    { id: 'dining', parentAccountId: 'food' },
    { id: 'rent', parentAccountId: 'root-expenses' },
    { id: 'utilities', parentAccountId: 'root-expenses' },
  ];

  it('resolves full subtree including roots and intermediate nodes', () => {
    const subtree = ScopeResolver.resolveSubtreeAccountIds(['food'], accounts);
    expect(subtree.has('food' as any)).toBe(true);
    expect(subtree.has('groceries' as any)).toBe(true);
    expect(subtree.has('dining' as any)).toBe(true);
    expect(subtree.has('rent' as any)).toBe(false);
  });

  it('resolves strictly leaf nodes for budget spend posting', () => {
    const leaves = ScopeResolver.resolveLeafAccountIds(['food'], accounts);
    expect(leaves.has('food' as any)).toBe(false); // food has children -> not a leaf
    expect(leaves.has('groceries' as any)).toBe(true);
    expect(leaves.has('dining' as any)).toBe(true);
  });

  it('handles deep root queries', () => {
    const leaves = ScopeResolver.resolveLeafAccountIds(['root-expenses'], accounts);
    expect(leaves).toEqual(new Set(['groceries', 'dining', 'rent', 'utilities']));
  });

  it('safely handles cyclical parent-child relations without hanging', () => {
    const cyclicAccounts = [
      { id: 'a', parentAccountId: 'c' },
      { id: 'b', parentAccountId: 'a' },
      { id: 'c', parentAccountId: 'b' },
    ];

    const subtree = ScopeResolver.resolveSubtreeAccountIds(['a'], cyclicAccounts);
    expect(subtree.size).toBe(3);
  });
});
