import { AppConfig } from '@/src/constants';
import {
  formatAmount,
  formatAmountOrLoading,
  FORMAT_AMOUNT_LOADING,
} from '@/src/features/dashboard/utils/formatAmount';
import { formatMoneyAmount } from '@/src/components/common/moneyFormat';

jest.mock('@/src/utils/currencyFormatter', () => ({
  CurrencyFormatter: {
    format: jest.fn((val: number) => `$${val}`),
  },
}));

describe('formatAmount', () => {
  it('masks when privacy mode is on', () => {
    expect(formatMoneyAmount(1234, 'USD', true, { style: 'sts' })).toBe(AppConfig.privacyMask);
  });

  it('handles small positive values', () => {
    expect(formatAmount(0.2, 'USD')).toBe('< $1');
  });

  it('handles small negative values', () => {
    expect(formatAmount(-0.2, 'USD')).toBe('> -$1');
  });

  it('formats normal amounts', () => {
    expect(formatAmount(1500, 'USD')).toBe('$1500');
  });

  it('formatAmountOrLoading returns placeholder while loading', () => {
    expect(formatAmountOrLoading(100, 'USD', false, true)).toBe(FORMAT_AMOUNT_LOADING);
  });

  it('formatAmountOrLoading formats when not loading', () => {
    expect(formatAmountOrLoading(100, 'USD', false, false)).toBe('$100');
  });
});
