import { AppNavigation, buildRoute } from '../navigation';
import { readJournalSearchScope } from '../journalSearchScope';
import { dispatchWorkplaceSwitchHistory } from '@/src/navigation/workplaceSwitchHistory';
import type { NavigationState } from 'expo-router/react-navigation';
import { asAccountId } from '@/src/types/ids';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
    dismissTo: jest.fn(),
    navigate: jest.fn(),
  },
}));

jest.mock('@/src/services/preferences', () => ({
  preferences: { device: { activeWorkplaceId: 'active-wp' } },
}));

const { router } = jest.requireMock('expo-router') as {
  router: {
    back: jest.Mock;
    canGoBack: jest.Mock;
    push: jest.Mock;
    replace: jest.Mock;
    dismissTo: jest.Mock;
    navigate: jest.Mock;
  };
};

describe('buildRoute', () => {
  it('returns pathname as Href when no params are provided', () => {
    expect(buildRoute('/account-details')).toBe('/account-details');
  });

  it('correctly serializes single and multiple query parameters', () => {
    expect(buildRoute('/account-details', { accountId: 'acc_123' })).toBe(
      '/account-details?accountId=acc_123',
    );
    expect(
      buildRoute('/reports', {
        startDate: 1000,
        endDate: 2000,
        currencyCode: 'USD',
      }),
    ).toBe('/reports?startDate=1000&endDate=2000&currencyCode=USD');
  });

  it('omits undefined, null, and empty string parameters cleanly', () => {
    expect(
      buildRoute('/journal-search', {
        q: 'coffee',
        startDate: undefined,
        endDate: null,
        minAmount: '',
        maxAmount: 50,
      }),
    ).toBe('/journal-search?q=coffee&maxAmount=50');
  });

  it('serializes journal scopes for report drill-downs', () => {
    AppNavigation.toJournalSearch({
      startDate: 1000,
      endDate: 2000,
      accountIds: ['food', 'dining'],
      journalIds: ['journal-1', 'journal-2'],
    });

    expect(router.push).toHaveBeenCalledWith(
      '/journal-search?startDate=1000&endDate=2000&accountIds=food%2Cdining&journalIds=journal-1%2Cjournal-2',
    );
  });

  it('keeps large journal scopes out of the navigation URL', () => {
    const journalIds = Array.from({ length: 2138 }, (_, index) => `journal-${index}`);

    AppNavigation.toJournalSearch({ journalIds });

    const route = router.push.mock.calls[0][0] as string;
    expect(route.length).toBeLessThan(400);
    expect(route).toContain('journalScope=');
    expect(route).not.toContain('journalIds=');
    const scopeId = new URL(route, 'https://reports.test').searchParams.get('journalScope');
    expect(readJournalSearchScope(scopeId ?? undefined)).toEqual(journalIds);
  });

  it('opens the Reports V2 route separately from the legacy Reports route', () => {
    AppNavigation.toReports();
    AppNavigation.toReportsV2();

    expect(router.push).toHaveBeenNthCalledWith(1, '/reports');
    expect(router.push).toHaveBeenNthCalledWith(2, '/reports-v2');
  });

  it('handles boolean values', () => {
    expect(buildRoute('/settings', { isEnabled: true, isArchived: false })).toBe(
      '/settings?isEnabled=true&isArchived=false',
    );
  });
});

describe('journal-entry navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    router.canGoBack.mockReturnValue(true);
  });

  it('opens a blank journal entry stamped with the active workplace', () => {
    AppNavigation.toJournalEntry();

    expect(router.push).toHaveBeenCalledWith('/journal-entry?workplaceId=active-wp');
  });

  it('opts the FAB simple-entry flow into guided autopilot explicitly', () => {
    AppNavigation.toSimpleJournalEntry('expense', { guidedAutopilot: true });
    AppNavigation.toSimpleJournalEntry('income');

    expect(router.push).toHaveBeenNthCalledWith(
      1,
      '/journal-entry?mode=simple&type=expense&guidedAutopilot=true&workplaceId=active-wp',
    );
    expect(router.push).toHaveBeenNthCalledWith(
      2,
      '/journal-entry?mode=simple&type=income&workplaceId=active-wp',
    );
  });

  it('preserves prefilled, edit/copy, and planned-entry route data', () => {
    AppNavigation.toJournalEntry({
      journalId: 'planned-copy-1',
      amount: '12.34',
      notes: 'Imported from SMS',
      initialDate: '2026-08-25T12:30:00.000Z',
      params: { mode: 'simple', type: 'expense', source: 'widget' },
    });

    const route = router.push.mock.calls[0][0] as string;
    expect(route).toContain('/journal-entry?');
    expect(route).toContain('journalId=planned-copy-1');
    expect(route).toContain('notes=Imported+from+SMS');
    expect(route).toContain('mode=simple');
    expect(route).toContain('source=widget');
    expect(route).toContain('workplaceId=active-wp');
  });

  it('accepts a typed transaction intent seed while preserving the route contract', () => {
    AppNavigation.toJournalEntry({
      seed: {
        editorMode: 'simple',
        type: 'expense',
        amount: '45.00',
        sourceAccountId: asAccountId('cash'),
        destinationAccountId: asAccountId('food'),
        sourceContext: { launchSource: 'dashboard' },
      },
    });

    expect(router.push).toHaveBeenCalledWith(
      '/journal-entry?mode=simple&type=expense&sourceAccountId=cash&destinationAccountId=food&amount=45.00&source=dashboard&workplaceId=active-wp',
    );
  });

  it('supports advanced and split editor entry modes', () => {
    AppNavigation.toJournalEntry({
      sourceAccountId: 'cash',
      params: { mode: 'advanced', destinationAccountId: 'food' },
    });
    AppNavigation.toJournalEntry({ params: { mode: 'split' } });

    expect(router.push).toHaveBeenNthCalledWith(
      1,
      '/journal-entry?sourceAccountId=cash&mode=advanced&destinationAccountId=food&workplaceId=active-wp',
    );
    expect(router.push).toHaveBeenNthCalledWith(
      2,
      '/journal-entry?mode=split&workplaceId=active-wp',
    );
  });

  it('does not stack the same journal-entry route on rapid repeated navigation', () => {
    AppNavigation.toJournalEntry({
      journalId: 'journal-1',
      params: { mode: 'simple', type: 'expense' },
    });
    AppNavigation.toJournalEntry({
      journalId: 'journal-1',
      params: { mode: 'simple', type: 'expense' },
    });

    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith(
      '/journal-entry?journalId=journal-1&mode=simple&type=expense&workplaceId=active-wp',
    );
  });

  it('clears the duplicate guard when returning so the route can be opened again', () => {
    AppNavigation.toJournalEntry({ journalId: 'journal-2' });
    AppNavigation.back();
    AppNavigation.toJournalEntry({ journalId: 'journal-2' });

    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(2);
  });
});

describe('account form navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes the journal-entry return target into the account form route', () => {
    AppNavigation.toAccountForm(undefined, {
      name: 'Groceries',
      returnTarget: { kind: 'batchRow', rowId: 'row-1', role: 'destination' },
    });
    AppNavigation.toAccountForm(undefined, { name: 'Wallet' });

    expect(router.push).toHaveBeenNthCalledWith(
      1,
      '/account-creation?pName=Groceries&returnTarget=destination-row%3Arow-1&workplaceId=active-wp',
    );
    expect(router.push).toHaveBeenNthCalledWith(
      2,
      '/account-creation?pName=Wallet&workplaceId=active-wp',
    );
  });
});

describe('navigation after account removal', () => {
  const removedId = asAccountId('removed-group');
  const list = {
    key: 'list',
    name: '(tabs)',
    state: { index: 1, routes: [{ name: 'index' }, { name: 'accounts' }] },
  };
  const details = { key: 'details', name: 'account-details', params: { accountId: removedId } };
  const form = { key: 'form', name: 'account-creation', params: { accountId: removedId } };
  function navigationFor(routes: { key: string; name: string; params?: object; state?: object }[]) {
    return {
      getState: () => ({ key: 'root', index: routes.length - 1, routes }),
      dispatch: jest.fn(),
    };
  }

  beforeEach(() => {
    jest.clearAllMocks();
    router.canGoBack.mockReturnValue(true);
  });

  it('pops directly back to the existing list instead of replacing the current page', () => {
    const navigation = navigationFor([list, details]);
    AppNavigation.afterAccountRemoval(removedId, navigation);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it('returns to a different parent account as a valid previous destination', () => {
    const parent = {
      ...details,
      key: 'parent',
      params: { accountId: asAccountId('enclosing-group') },
    };
    const navigation = navigationFor([list, parent, details]);
    AppNavigation.afterAccountRemoval(removedId, navigation);
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(navigation.dispatch).not.toHaveBeenCalled();
  });

  it.each(['account-creation', 'category-creation'])(
    'skips removed details underneath the %s form',
    name => {
      const navigation = navigationFor([list, details, { ...form, name }]);
      AppNavigation.afterAccountRemoval(removedId, navigation);
      expect(navigation.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'RESET',
          target: 'root',
          payload: { ...navigation.getState(), index: 0, routes: [list] },
        }),
      );
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    },
  );

  it('removes older pages for the group even when the nearest previous page is valid', () => {
    const search = { key: 'search', name: 'journal-search', params: { q: 'coffee' } };
    const navigation = navigationFor([
      list,
      details,
      search,
      { ...details, key: 'second-details' },
    ]);
    AppNavigation.afterAccountRemoval(removedId, navigation);
    expect(navigation.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RESET',
        payload: { ...navigation.getState(), index: 1, routes: [list, search] },
      }),
    );
  });

  it.each([[details], [details, form]])(
    'resets to the account list when history contains no valid target (%j)',
    (...routes) => {
      const navigation = navigationFor(routes);
      AppNavigation.afterAccountRemoval(removedId, navigation);
      expect(navigation.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'RESET',
          payload: {
            index: 0,
            routes: [{ name: '(tabs)', state: { index: 0, routes: [{ name: 'accounts' }] } }],
          },
        }),
      );
      expect(router.back).not.toHaveBeenCalled();
      expect(router.replace).not.toHaveBeenCalled();
    },
  );

  it('uses the account list fallback when back navigation is unavailable', () => {
    router.canGoBack.mockReturnValue(false);
    const navigation = navigationFor([list, details]);
    AppNavigation.afterAccountRemoval(removedId, navigation);
    expect(navigation.dispatch).toHaveBeenCalledWith(expect.objectContaining({ type: 'RESET' }));
    expect(router.back).not.toHaveBeenCalled();
  });

  it('does not navigate again if the user left while the command was pending', () => {
    const navigation = navigationFor([list]);
    AppNavigation.afterAccountRemoval(removedId, navigation);
    expect(navigation.dispatch).not.toHaveBeenCalled();
    expect(router.back).not.toHaveBeenCalled();
  });
});

describe('settings navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('serializes a settings focus target into the destination route', () => {
    AppNavigation.toAppearanceSettings('typography');

    expect(router.push).toHaveBeenCalledWith('/appearance-settings?focus=typography');
  });
});

describe('workplace switch history', () => {
  beforeEach(() => jest.clearAllMocks());
  function history(routes: NavigationState['routes']): NavigationState {
    return {
      key: 'root',
      index: routes.length - 1,
      routes,
      routeKeySeq: 0,
      routeNames: routes.map(route => route.name),
      stale: false,
    };
  }
  const tabs = {
    key: 'tabs',
    name: '(tabs)',
    state: {
      stale: true as const,
      index: 0,
      routes: [
        { key: 'accounts', name: 'accounts', params: { tab: 'categories' } },
        { key: 'activity', name: 'activity' },
        { key: 'commitments', name: 'commitments', params: { tab: 'planned' } },
      ],
    },
  };

  it('removes every old record route and returns to the matching list', () => {
    const dispatch = jest.fn();
    dispatchWorkplaceSwitchHistory({
      getState: () =>
        history([
          tabs,
          { key: 'account', name: 'account-details', params: { accountId: 'old' } },
          { key: 'journal', name: 'journal-details', params: { journalId: 'old' } },
        ]),
      dispatch,
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'RESET',
        target: 'root',
        payload: expect.objectContaining({
          index: 0,
          routes: [
            expect.objectContaining({
              key: 'tabs',
              name: '(tabs)',
              state: expect.objectContaining({
                index: 1,
                routes: expect.arrayContaining([expect.objectContaining({ name: 'activity' })]),
              }),
            }),
          ],
        }),
      }),
    );
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('keeps notification navigation above the retained tab and removes old details underneath', () => {
    const dispatch = jest.fn();
    const inbox = { name: 'sms-inbox', key: 'inbox' };
    dispatchWorkplaceSwitchHistory({
      getState: () =>
        history([
          tabs,
          { key: 'old-detail', name: 'account-details', params: { accountId: 'old' } },
          inbox,
        ]),
      dispatch,
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ routes: [tabs, inbox], index: 1 }),
      }),
    );
  });

  it('preserves a bound creation draft and the selected subtab', () => {
    const dispatch = jest.fn();
    dispatchWorkplaceSwitchHistory({
      getState: () =>
        history([
          tabs,
          { key: 'draft', name: 'journal-entry', params: { workplaceId: 'original' } },
        ]),
      dispatch,
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('returns an old insight to the Hub already underneath it without stacking a second Hub', () => {
    const dispatch = jest.fn();
    const hub = { key: 'hub', name: 'hub' };
    dispatchWorkplaceSwitchHistory({
      getState: () =>
        history([
          tabs,
          hub,
          { key: 'insight', name: 'insight-details', params: { insightId: 'old' } },
        ]),
      dispatch,
    });
    expect(dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        payload: expect.objectContaining({ routes: [tabs, hub], index: 1 }),
      }),
    );
  });

  it('dismisses a restore journey when returning to Settings', () => {
    AppNavigation.returnToSettings();
    expect(router.dismissTo).toHaveBeenCalledWith('/settings');
  });
});
