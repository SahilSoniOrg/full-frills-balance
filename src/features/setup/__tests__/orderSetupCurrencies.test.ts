import { orderSetupCurrencies, pinnedSetupCurrencyId } from '../orderSetupCurrencies';

const items = [
  { id: 'ZWL', subtitle: 'Zimbabwean Dollar' },
  { id: 'USD', subtitle: 'US Dollar' },
  { id: 'INR', subtitle: 'Indian Rupee' },
];

describe('orderSetupCurrencies', () => {
  it('pins the opening selection and leaves later taps in place', () => {
    const pinned = pinnedSetupCurrencyId(
      undefined,
      'USD',
      items.map(item => item.id),
    );
    const opened = orderSetupCurrencies(items, pinned, '');
    expect(opened.map(item => item.id)).toEqual(['USD', 'ZWL', 'INR']);

    const afterTap = pinnedSetupCurrencyId(
      pinned,
      'INR',
      items.map(item => item.id),
    );
    expect(orderSetupCurrencies(items, afterTap, '').map(item => item.id)).toEqual([
      'USD',
      'ZWL',
      'INR',
    ]);
  });

  it('does not re-pin when search is cleared', () => {
    const pinned = pinnedSetupCurrencyId(
      undefined,
      'USD',
      items.map(item => item.id),
    );
    const filtered = orderSetupCurrencies(items, pinned, 'inr');
    expect(filtered.map(item => item.id)).toEqual(['INR']);
    expect(orderSetupCurrencies(items, pinned, '').map(item => item.id)[0]).toBe('USD');
  });
});
