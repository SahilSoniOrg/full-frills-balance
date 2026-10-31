import {
  POPULAR_CURRENCY_CODES,
  resolveCurrencySymbol,
  toCurrencyPickerSections,
} from '@/src/features/accounts/helpers/currencyPickerOptions';
import type { PlainCurrency } from '@/src/types/plainDtos';

const currencies = [
  { code: 'AFN', name: 'Afghan Afghani', symbol: 'Af' },
  { code: 'USD', name: 'US Dollar', symbol: '$' },
  { code: 'EUR', name: 'Euro', symbol: '€' },
  { code: 'AMD', name: 'Armenian Dram', symbol: '֏' },
] as PlainCurrency[];

describe('toCurrencyPickerSections', () => {
  it('pins selected + a short popular set above the A–Z rest', () => {
    expect(POPULAR_CURRENCY_CODES).toHaveLength(10);
    const sections = toCurrencyPickerSections(currencies, 'AMD');
    expect(sections.map(section => section.title)).toEqual(['Popular', 'All currencies']);
    expect(sections[0].data.map(row => row.id)).toEqual(['AMD', 'USD', 'EUR']);
    expect(sections[0].data[0]).toEqual({
      id: 'AMD',
      name: 'Armenian Dram',
      code: 'AMD',
      symbol: '֏',
    });
    expect(sections[1].data.map(row => row.id)).toEqual(['AFN']);
  });
});

describe('resolveCurrencySymbol', () => {
  it('prefers live currency metadata over static fallbacks', () => {
    expect(resolveCurrencySymbol('AMD', currencies, { AMD: 'AMD!' })).toBe('֏');
    expect(resolveCurrencySymbol('XYZ', [], { XYZ: '¤' })).toBe('¤');
    expect(resolveCurrencySymbol('XYZ', [])).toBe('XYZ');
  });
});
