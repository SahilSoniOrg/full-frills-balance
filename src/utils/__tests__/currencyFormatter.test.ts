import {
  CurrencyFormatter,
  formatMoneyAmount,
  getCurrencyLocale,
} from '@/src/utils/currencyFormatter';
// Mock preferences to avoid AsyncStorage issues
jest.mock('@/src/services/preferences', () => ({
  preferences: {
    defaultCurrencyCode: 'USD',
  },
}));

describe('CurrencyFormatter', () => {
  describe('formatAmount', () => {
    it('formats USD correctly with default options', () => {
      const result = CurrencyFormatter.formatAmount(1234.56, 'USD');
      // Use regex or contain because locale might vary slightly (space/no-space)
      expect(result).toMatch(/\$1,234\.56/);
    });

    it('formats EUR correctly', () => {
      const result = CurrencyFormatter.formatAmount(1234.56, 'EUR');
      expect(result).toMatch(/€1,234\.56/);
    });

    it('respects includeSymbol: false', () => {
      const result = CurrencyFormatter.formatAmount(1234.56, 'USD', { includeSymbol: false });
      expect(result).toMatch(/1,234\.56/);
      expect(result).not.toContain('$');
    });

    it('respects fraction digit options', () => {
      const result = CurrencyFormatter.formatAmount(1234.5678, 'USD', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      });
      expect(result).toMatch(/\$1,235/);
    });

    it('handles fallback for invalid currency', () => {
      // Mock toLocaleString to throw to test fallback
      const spy = jest.spyOn(Number.prototype, 'toLocaleString').mockImplementation(() => {
        throw new Error('fail');
      });

      const result = CurrencyFormatter.formatAmount(100, 'INVALID');
      expect(result).toBe('100.00 INVALID');

      spy.mockRestore();
    });

    it('formats AMD using custom symbol', () => {
      // AMD usually formats as 'AMD 100.00' or similar in some locales without symbol
      // We want to ensure it shows The Symbol ֏
      const result = CurrencyFormatter.formatAmount(100, 'AMD');
      expect(result).toMatch(/֏100\.00/);
    });

    it('uses code as suffix for unknown currency', () => {
      const result = CurrencyFormatter.formatAmount(100, 'UNKNOWN');
      // Check for "100.00 UNKNOWN" pattern
      expect(result).toMatch(/100\.00\sUNKNOWN/);
    });

    it('respects JPY zero precision', () => {
      const result = CurrencyFormatter.formatAmount(1234.56, 'JPY');
      // JPY should have 0 decimal places
      expect(result).toMatch(/¥1,235/);
    });

    it('respects KWD three precision', () => {
      const result = CurrencyFormatter.formatAmount(1234.5678, 'KWD');
      // KWD should have 3 decimal places
      expect(result).toMatch(/1,234\.568/); // Note: KWD might use code or symbol depending on locale, but precision should be 3
    });
  });

  describe('formatShort', () => {
    it('formats thousands as K', () => {
      expect(CurrencyFormatter.formatShort(1500, 'USD')).toBe('1.5K');
      expect(CurrencyFormatter.formatShort(1000, 'USD')).toBe('1K');
    });

    it('formats millions as M', () => {
      expect(CurrencyFormatter.formatShort(2500000, 'USD')).toBe('2.5M');
    });

    it('formats billions as B', () => {
      expect(CurrencyFormatter.formatShort(3000000000, 'USD')).toBe('3B');
    });

    describe('INR special handling', () => {
      it('formats 100K as 1L in INR', () => {
        expect(CurrencyFormatter.formatShort(100000, 'INR')).toBe('1L');
        expect(CurrencyFormatter.formatShort(150000, 'INR')).toBe('1.5L');
      });

      it('formats 10M as 1Cr in INR', () => {
        expect(CurrencyFormatter.formatShort(10000000, 'INR')).toBe('1Cr');
        expect(CurrencyFormatter.formatShort(12000000, 'INR')).toBe('1.2Cr');
      });

      it('still uses K for thousands in INR', () => {
        expect(CurrencyFormatter.formatShort(5000, 'INR')).toBe('5K');
      });
    });

    it('handles negative numbers correctly', () => {
      expect(CurrencyFormatter.formatShort(-1500, 'USD')).toBe('-1.5K');
    });

    it('uses en-IN compact for INR (lakh/crore) and en-US for others', () => {
      expect(CurrencyFormatter.formatShort(45000, 'INR')).toBe('45K');
      expect(CurrencyFormatter.formatShort(2500000, 'INR')).toBe('25L');
      expect(CurrencyFormatter.formatShort(98765432, 'INR')).toBe('9.9Cr');
      expect(CurrencyFormatter.formatShort(-150000, 'INR')).toBe('-1.5L');
      expect(CurrencyFormatter.formatShort(3.2e9, 'USD')).toBe('3.2B');
      expect(CurrencyFormatter.formatShort(1.5e12, 'USD')).toBe('1.5T');
    });

    it('falls back to suffixes when Intl ignores compact notation (Hermes iOS)', () => {
      jest.isolateModules(() => {
        const Orig = Intl.NumberFormat;
        const spy = jest
          .spyOn(Intl, 'NumberFormat')
          .mockImplementation(
            ((locale: string, opts: Intl.NumberFormatOptions) =>
              new Orig(locale, { ...opts, notation: 'standard' })) as never,
          );
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { CurrencyFormatter: F } = require('@/src/utils/currencyFormatter');
          expect(F.formatShort(150000, 'INR')).toBe('1.5L');
          expect(F.formatShort(98765432, 'INR')).toBe('9.9Cr');
          expect(F.formatShort(2500000, 'USD')).toBe('2.5M');
          expect(F.formatShort(-1500, 'USD')).toBe('-1.5K');
        } finally {
          spy.mockRestore();
        }
      });
    });

    it('returns exact amount without decimals if below 1000', () => {
      expect(CurrencyFormatter.formatShort(500, 'USD')).toMatch(/\$500/);
    });
  });

  describe('getPrecisionFallback', () => {
    it('should return 2 for undefined or unknown code', () => {
      expect(CurrencyFormatter.getPrecisionFallback(undefined)).toBe(2);
      expect(CurrencyFormatter.getPrecisionFallback('UNKNOWN')).toBe(2);
    });

    it('should return 0 for JPY and KRW', () => {
      expect(CurrencyFormatter.getPrecisionFallback('JPY')).toBe(0);
      expect(CurrencyFormatter.getPrecisionFallback('KRW')).toBe(0);
      expect(CurrencyFormatter.getPrecisionFallback('jpy')).toBe(0);
    });

    it('should return 3 for KWD, BHD, OMR, JOD, TND', () => {
      expect(CurrencyFormatter.getPrecisionFallback('KWD')).toBe(3);
      expect(CurrencyFormatter.getPrecisionFallback(' KWD ')).toBe(3);
      expect(CurrencyFormatter.getPrecisionFallback('BHD')).toBe(3);
      expect(CurrencyFormatter.getPrecisionFallback('OMR')).toBe(3);
      expect(CurrencyFormatter.getPrecisionFallback('JOD')).toBe(3);
      expect(CurrencyFormatter.getPrecisionFallback('TND')).toBe(3);
    });
  });

  describe('Indian digit grouping', () => {
    it('groups INR amounts as lakh/crore', () => {
      expect(CurrencyFormatter.format(98765432.5, 'INR')).toBe('₹9,87,65,432.50');
      expect(CurrencyFormatter.format(123456, 'INR')).toBe('₹1,23,456.00');
      expect(CurrencyFormatter.format(1000, 'INR')).toBe('₹1,000.00');
      expect(CurrencyFormatter.format(999, 'INR')).toBe('₹999.00');
      expect(CurrencyFormatter.format(0, 'INR')).toBe('₹0.00');
    });

    it('handles negatives, symbol-less output and lowercase codes', () => {
      expect(CurrencyFormatter.format(-1234567.89, 'INR')).toBe('-₹12,34,567.89');
      expect(CurrencyFormatter.format(-0.001, 'INR')).toBe('₹0.00');
      expect(CurrencyFormatter.format(12345678, 'INR', { includeSymbol: false })).toBe(
        '1,23,45,678.00',
      );
      expect(CurrencyFormatter.format(1234567, 'inr')).toBe('₹12,34,567.00');
    });

    it('respects fraction options for INR', () => {
      expect(
        CurrencyFormatter.format(98765432.5, 'INR', {
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
      ).toBe('₹9,87,65,433');
      expect(formatMoneyAmount(98765432.5, 'INR', false, { style: 'compact' })).toBe(
        '₹9,87,65,433',
      );
      expect(formatMoneyAmount(150000, 'INR', false, { style: 'trimmed' })).toBe('₹1,50,000');
    });

    it('keeps western grouping for other currencies', () => {
      expect(CurrencyFormatter.format(98765432.5, 'USD')).toBe('$98,765,432.50');
      expect(CurrencyFormatter.format(98765432.5, 'USD', { includeSymbol: false })).toBe(
        '98,765,432.50',
      );
    });

    it('takes the formatting locale from the currency definition', () => {
      expect(getCurrencyLocale('INR')).toBe('en-IN');
      expect(getCurrencyLocale('inr')).toBe('en-IN');
      expect(getCurrencyLocale('USD')).toBeUndefined();
      expect(CurrencyFormatter.format(98765432.5, 'INR')).toBe(
        (98765432.5).toLocaleString('en-IN', { style: 'currency', currency: 'INR' }),
      );
    });

    it('falls back to the default locale for currencies without one', () => {
      expect(getCurrencyLocale('EUR')).toBeUndefined();
      expect(CurrencyFormatter.format(98765432.5, 'EUR')).toBe(
        (98765432.5).toLocaleString(undefined, { style: 'currency', currency: 'EUR' }),
      );
    });
  });
});
