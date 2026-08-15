import { buildRoute } from '../navigation';

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
