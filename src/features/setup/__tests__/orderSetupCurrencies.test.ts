import { orderSetupCurrencies } from '../orderSetupCurrencies';

const items = [
  { id: 'ZWL', subtitle: 'Zimbabwean Dollar', symbol: 'Z$' },
  { id: 'USD', subtitle: 'US Dollar', symbol: '$' },
  { id: 'INR', subtitle: 'Indian Rupee', symbol: '₹' },
  { id: 'AMD', subtitle: 'Armenian Dram', symbol: '֏' },
];

describe('orderSetupCurrencies', () => {
  it('pins the opening selection and leaves later taps in place', () => {
    const pinned = 'USD';
    const opened = orderSetupCurrencies(items, pinned, '');
    expect(opened.map(item => item.id)).toEqual(['USD', 'ZWL', 'INR', 'AMD']);

    const afterTap = pinned;
    expect(orderSetupCurrencies(items, afterTap, '').map(item => item.id)).toEqual([
      'USD',
      'ZWL',
      'INR',
      'AMD',
    ]);
  });

  it('does not re-pin when search is cleared', () => {
    const pinned = 'USD';
    const filtered = orderSetupCurrencies(items, pinned, 'inr');
    expect(filtered.map(item => item.id)).toEqual(['INR']);
    expect(orderSetupCurrencies(items, pinned, '').map(item => item.id)[0]).toBe('USD');
  });

  it('matches currency symbols in search', () => {
    expect(orderSetupCurrencies(items, 'USD', '֏').map(item => item.id)).toEqual(['AMD']);
  });
});
