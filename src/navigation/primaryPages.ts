export type PrimaryPageGroup = 'dashboard' | 'accounts' | 'commitments' | 'activity';

export type PrimaryPageId =
  'dashboard' | 'accounts' | 'categories' | 'budgets' | 'planned-payments' | 'activity';

export type PrimaryPage = {
  readonly id: PrimaryPageId;
  readonly routeName: string;
  readonly title: string;
  readonly group: PrimaryPageGroup;
  readonly order: number;
  readonly groupDefault?: true;
};

export type PrimaryPageRouteName = PrimaryPage['routeName'];

/** Canonical route order for primary surfaces. Group chrome is defined in primaryNavigation.tsx. */
export const PRIMARY_PAGES = [
  {
    id: 'dashboard',
    routeName: 'index',
    title: 'Dashboard',
    group: 'dashboard',
    order: 0,
    groupDefault: true,
  },
  {
    id: 'accounts',
    routeName: 'accounts',
    title: 'Accounts',
    group: 'accounts',
    order: 1,
    groupDefault: true,
  },
  { id: 'categories', routeName: 'categories', title: 'Categories', group: 'accounts', order: 2 },
  {
    id: 'budgets',
    routeName: 'commitments',
    title: 'Budgets',
    group: 'commitments',
    order: 3,
    groupDefault: true,
  },
  {
    id: 'planned-payments',
    routeName: 'planned-payments',
    title: 'Planned Payments',
    group: 'commitments',
    order: 4,
  },
  {
    id: 'activity',
    routeName: 'activity',
    title: 'Activity',
    group: 'activity',
    order: 5,
    groupDefault: true,
  },
] as const satisfies readonly PrimaryPage[];

export const PRIMARY_PAGE_ROUTE_NAMES = PRIMARY_PAGES.map(page => page.routeName);

export const PRIMARY_GROUP_DEFAULT_ROUTE = Object.fromEntries(
  PRIMARY_PAGES.filter(page => 'groupDefault' in page && page.groupDefault).map(page => [
    page.group,
    page.routeName,
  ]),
) as Readonly<Record<PrimaryPageGroup, string>>;

const rememberedGroupRoutes = new Map<PrimaryPageGroup, string>();

/** Session-local group memory. Survives workplace remounts; clear in tests. */
export function clearRememberedPrimaryGroupRoutes(): void {
  rememberedGroupRoutes.clear();
}

export function rememberPrimaryGroupRoute(routeName: string): void {
  const page = primaryPageFromRouteName(routeName);
  if (page) rememberedGroupRoutes.set(page.group, page.routeName);
}

export function primaryRouteForGroup(group: PrimaryPageGroup): string {
  const remembered = rememberedGroupRoutes.get(group);
  const rememberedPage = primaryPageFromRouteName(remembered);
  return rememberedPage?.group === group
    ? rememberedPage.routeName
    : PRIMARY_GROUP_DEFAULT_ROUTE[group];
}

export function primaryPageFromRouteName(routeName?: string): PrimaryPage | undefined {
  return PRIMARY_PAGES.find(page => page.routeName === routeName);
}

export function primaryPageIndex(routeName?: string): number {
  return PRIMARY_PAGES.findIndex(page => page.routeName === routeName);
}

export function primaryPageForIndex(index: number): PrimaryPage | undefined {
  return PRIMARY_PAGES[index];
}

export function primaryRoutesInGroup(group: PrimaryPageGroup): readonly string[] {
  return PRIMARY_PAGES.filter(page => page.group === group).map(page => page.routeName);
}

export type LegacyPrimaryRoute = {
  routeName: string;
  params?: Record<string, unknown>;
};

/** Convert old query-selected Accounts and Plans routes to their canonical leaf route. */
export function normalizeLegacyPrimaryRoute(
  routeName: string,
  params?: Record<string, unknown>,
): LegacyPrimaryRoute {
  if (routeName !== 'accounts' && routeName !== 'commitments') {
    return { routeName, ...(params ? { params } : {}) };
  }

  const tab = params?.tab;
  const normalizedRoute =
    routeName === 'accounts'
      ? tab === 'categories'
        ? 'categories'
        : 'accounts'
      : tab === 'planned'
        ? 'planned-payments'
        : 'commitments';

  const normalizedParams = params
    ? Object.fromEntries(Object.entries(params).filter(([key]) => key !== 'tab'))
    : undefined;

  return {
    routeName: normalizedRoute,
    ...(normalizedParams && Object.keys(normalizedParams).length > 0
      ? { params: normalizedParams }
      : {}),
  };
}
