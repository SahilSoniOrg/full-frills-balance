import { AppNavigation, buildRoute } from '../navigation';
import { asAccountId } from '@/src/types/ids';

jest.mock('expo-router', () => ({
  router: {
    back: jest.fn(),
    canGoBack: jest.fn(() => true),
    push: jest.fn(),
    replace: jest.fn(),
  },
}));

const { router } = jest.requireMock('expo-router') as {
  router: {
    back: jest.Mock;
    canGoBack: jest.Mock;
    push: jest.Mock;
    replace: jest.Mock;
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

  it('opens a blank journal entry without stale query parameters', () => {
    AppNavigation.toJournalEntry();

    expect(router.push).toHaveBeenCalledWith('/journal-entry');
  });

  it('opens the isolated batch workspace', () => {
    AppNavigation.toBulkJournalEntry();

    expect(router.push).toHaveBeenCalledWith('/journal-bulk');
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
      '/journal-entry?mode=simple&type=expense&sourceAccountId=cash&destinationAccountId=food&amount=45.00&source=dashboard',
    );
  });

  it('supports advanced and split editor entry modes', () => {
    AppNavigation.toAdvancedJournalEntry({
      sourceAccountId: 'cash',
      destinationAccountId: 'food',
    });
    AppNavigation.toJournalEntry({ params: { mode: 'split' } });

    expect(router.push).toHaveBeenNthCalledWith(
      1,
      '/journal-entry?sourceAccountId=cash&mode=advanced&destinationAccountId=food',
    );
    expect(router.push).toHaveBeenNthCalledWith(2, '/journal-entry?mode=split');
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
      '/journal-entry?journalId=journal-1&mode=simple&type=expense',
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
