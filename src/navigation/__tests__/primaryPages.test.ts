import {
  clearRememberedPrimaryGroupRoutes,
  normalizeLegacyPrimaryRoute,
  PRIMARY_GROUP_DEFAULT_ROUTE,
  PRIMARY_PAGES,
  PRIMARY_SWIPE_GROUPS,
  primaryAdjacentSwipeGroup,
  primaryEntryRouteForGroup,
  primaryInnerIndex,
  primaryPageForIndex,
  primaryPageFromRouteName,
  primaryPageIndex,
  primaryRouteForGroup,
  primaryRoutesInGroup,
  primarySwipeIndex,
  rememberPrimaryGroupRoute,
} from '@/src/navigation/primaryPages';

describe('primaryPages', () => {
  beforeEach(() => {
    clearRememberedPrimaryGroupRoutes();
  });

  it('orders the six canonical primary routes', () => {
    expect(PRIMARY_PAGES.map(page => page.routeName)).toEqual([
      'index',
      'accounts',
      'categories',
      'commitments',
      'planned-payments',
      'activity',
    ]);
    expect(primaryPageIndex('planned-payments')).toBe(4);
    expect(primaryPageForIndex(2)?.id).toBe('categories');
    expect(primaryPageFromRouteName('commitments')?.group).toBe('commitments');
  });

  it('normalizes legacy Accounts and Plans tab params to leaf routes', () => {
    expect(normalizeLegacyPrimaryRoute('accounts', { tab: 'categories', x: 1 })).toEqual({
      routeName: 'categories',
      params: { x: 1 },
    });
    expect(normalizeLegacyPrimaryRoute('accounts', { tab: 'accounts' })).toEqual({
      routeName: 'accounts',
    });
    expect(normalizeLegacyPrimaryRoute('commitments', { tab: 'planned' })).toEqual({
      routeName: 'planned-payments',
    });
    expect(normalizeLegacyPrimaryRoute('commitments', { tab: 'budgets', y: 2 })).toEqual({
      routeName: 'commitments',
      params: { y: 2 },
    });
    expect(normalizeLegacyPrimaryRoute('activity', { tab: 'ignored' })).toEqual({
      routeName: 'activity',
      params: { tab: 'ignored' },
    });
  });

  it('remembers the last committed page per group for the session', () => {
    expect(primaryRouteForGroup('accounts')).toBe(PRIMARY_GROUP_DEFAULT_ROUTE.accounts);

    rememberPrimaryGroupRoute('categories');
    expect(primaryRouteForGroup('accounts')).toBe('categories');

    rememberPrimaryGroupRoute('planned-payments');
    expect(primaryRouteForGroup('commitments')).toBe('planned-payments');
    expect(primaryRouteForGroup('accounts')).toBe('categories');

    clearRememberedPrimaryGroupRoutes();
    expect(primaryRouteForGroup('accounts')).toBe(PRIMARY_GROUP_DEFAULT_ROUTE.accounts);
    expect(primaryRouteForGroup('commitments')).toBe(PRIMARY_GROUP_DEFAULT_ROUTE.commitments);
  });

  it('ignores remember calls for unknown routes', () => {
    rememberPrimaryGroupRoute('not-a-primary-page');
    expect(primaryRouteForGroup('dashboard')).toBe(PRIMARY_GROUP_DEFAULT_ROUTE.dashboard);
  });

  it('maps leaf routes onto the four outer swipe groups', () => {
    expect(PRIMARY_SWIPE_GROUPS).toEqual(['dashboard', 'accounts', 'commitments', 'activity']);
    expect(primarySwipeIndex('index')).toBe(0);
    expect(primarySwipeIndex('accounts')).toBe(1);
    expect(primarySwipeIndex('categories')).toBe(1);
    expect(primarySwipeIndex('commitments')).toBe(2);
    expect(primarySwipeIndex('planned-payments')).toBe(2);
    expect(primarySwipeIndex('activity')).toBe(3);
    expect(primaryRoutesInGroup('accounts')).toEqual(['accounts', 'categories']);
    expect(primaryRoutesInGroup('commitments')).toEqual(['commitments', 'planned-payments']);
    expect(primaryInnerIndex('accounts')).toBe(0);
    expect(primaryInnerIndex('categories')).toBe(1);
    expect(primaryInnerIndex('planned-payments')).toBe(1);
    expect(primaryInnerIndex('index')).toBe(0);
    expect(primaryAdjacentSwipeGroup('accounts', 'next')).toBe('commitments');
    expect(primaryAdjacentSwipeGroup('accounts', 'prev')).toBe('dashboard');
    expect(primaryAdjacentSwipeGroup('dashboard', 'prev')).toBeUndefined();
    expect(primaryAdjacentSwipeGroup('activity', 'next')).toBeUndefined();
    expect(primaryEntryRouteForGroup('accounts', 'next')).toBe('accounts');
    expect(primaryEntryRouteForGroup('accounts', 'prev')).toBe('categories');
    expect(primaryEntryRouteForGroup('commitments', 'next')).toBe('commitments');
    expect(primaryEntryRouteForGroup('commitments', 'prev')).toBe('planned-payments');
    expect(primaryEntryRouteForGroup('dashboard', 'next')).toBe('index');
  });
});
