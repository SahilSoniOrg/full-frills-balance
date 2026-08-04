import { AppConfig } from '@/src/constants';
import {
  FORMAT_AMOUNT_LOADING,
  formatMoneyAmount,
  formatStsAmount,
} from '@/src/components/common/moneyFormat';

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
});
