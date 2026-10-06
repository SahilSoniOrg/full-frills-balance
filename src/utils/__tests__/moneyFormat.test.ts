import { AppConfig } from '@/src/constants';
import {
  FORMAT_AMOUNT_LOADING,
  formatMoneyAmount,
  formatStsAmount,
} from '@/src/utils/currencyFormatter';

describe('formatStsAmount / formatMoneyAmount', () => {
  it('masks when privacy is on', () => {
    expect(formatMoneyAmount(1234, 'USD', true, { style: 'sts' })).toBe(AppConfig.privacyMask);
  });

  it('formats small positive amounts as < $1', () => {
    expect(formatStsAmount(0.2, 'USD')).toBe('< $1');
  });

  it('formats small negative amounts as > -$1', () => {
    expect(formatStsAmount(-0.2, 'USD')).toBe('> -$1');
  });

  it('formats normal amounts without decimals', () => {
    expect(formatStsAmount(1500, 'USD')).toBe('$1,500');
  });

  it('returns loading placeholder when loading', () => {
    expect(formatMoneyAmount(100, 'USD', false, { style: 'sts', loading: true })).toBe(
      FORMAT_AMOUNT_LOADING,
    );
  });

  it('formats sts when not loading', () => {
    expect(formatMoneyAmount(100, 'USD', false, { style: 'sts', loading: false })).toBe('$100');
  });

  it('preserves cents for exact Safe-to-Spend balance breakdowns', () => {
    expect(formatMoneyAmount(11.37, 'USD', false)).toBe('$11.37');
  });

  it('prepends prefix when not in privacy mode', () => {
    expect(formatMoneyAmount(100, 'USD', false, { prefix: '+' })).toBe('+$100.00');
  });

  it('masks prefix along with amount in privacy mode', () => {
    expect(formatMoneyAmount(100, 'USD', true, { prefix: '-' })).toBe(AppConfig.privacyMask);
  });

  it('omits prefix when empty string', () => {
    expect(formatMoneyAmount(100, 'USD', false, { prefix: '' })).toBe('$100.00');
  });

  it.each([
    [180, 'USD', '$180'],
    [6301.51, 'USD', '$6,301.51'],
    [6301.5, 'USD', '$6,301.50'],
    [180.0000001, 'USD', '$180'],
    [179.996, 'USD', '$180'],
    [-24, 'USD', '-$24'],
  ])('trims whole amounts only: %p %s → %s', (amount, currency, expected) => {
    expect(formatMoneyAmount(amount, currency, false, { style: 'trimmed' })).toBe(expected);
  });

  it('trims zero-precision currencies and keeps the sign prefix', () => {
    expect(formatMoneyAmount(1500, 'JPY', false, { style: 'trimmed' })).not.toMatch(/\./);
    expect(formatMoneyAmount(180, 'USD', false, { style: 'trimmed', prefix: '− ' })).toBe('− $180');
  });
});
