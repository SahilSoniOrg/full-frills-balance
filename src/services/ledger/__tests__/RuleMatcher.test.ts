import { RuleMatcher, ResolvedSmsRule, SmsMatchData } from '../RuleMatcher';
import { TransactionDirection } from '@/src/data/models/TransactionInboxRecord';

describe('RuleMatcher', () => {
  const sampleData: SmsMatchData = {
    senderAddress: 'HDFCBK',
    rawBody: 'Your card XX1990 is debited by INR 1500 at SWIGGY',
    parsedMerchant: 'SWIGGY',
    parsedAccountSource: 'Card 1990',
    direction: TransactionDirection.DEBIT,
    parsedCurrencyCode: 'INR',
    parsedAmount: 1500,
  };

  describe('Regex Mode', () => {
    it('matches sender regex correctly', () => {
      const rule: ResolvedSmsRule = {
        mode: 'regex',
        senderMatch: 'HDFCBK|ICICIB',
        conditions: [],
        actions: { disposition: 'review' },
        priority: 100,
      };

      const predicate = RuleMatcher.compileRule(rule);
      expect(predicate(sampleData)).toBe(true);

      const differentData = { ...sampleData, senderAddress: 'AMEX' };
      expect(predicate(differentData)).toBe(false);
    });

    it('matches both sender and body regexes when provided', () => {
      const rule: ResolvedSmsRule = {
        mode: 'regex',
        senderMatch: 'HDFCBK',
        bodyMatch: 'SWIGGY|ZOMATO',
        conditions: [],
        actions: { disposition: 'review' },
        priority: 100,
      };

      const predicate = RuleMatcher.compileRule(rule);
      expect(predicate(sampleData)).toBe(true);

      const nonMatchingBody = { ...sampleData, rawBody: 'Your card XX1990 is debited at UBER' };
      expect(predicate(nonMatchingBody)).toBe(false);
    });
  });

  describe('Builder Mode', () => {
    it('matches simple contains rules', () => {
      const rule: ResolvedSmsRule = {
        mode: 'builder',
        conditions: [
          { field: 'sender', operator: 'contains', value: 'HDFC' },
          { field: 'merchant', operator: 'contains', value: 'SWIGGY' },
        ],
        actions: { disposition: 'review' },
        priority: 100,
      };

      const predicate = RuleMatcher.compileRule(rule);
      expect(predicate(sampleData)).toBe(true);

      const nonMatchingMerchant = { ...sampleData, parsedMerchant: 'ZOMATO' };
      expect(predicate(nonMatchingMerchant)).toBe(false);
    });

    it('matches strict equals rules', () => {
      const rule: ResolvedSmsRule = {
        mode: 'builder',
        conditions: [{ field: 'currency', operator: 'is', value: 'INR' }],
        actions: { disposition: 'review' },
        priority: 100,
      };

      const predicate = RuleMatcher.compileRule(rule);
      expect(predicate(sampleData)).toBe(true);

      const differentCurrency = { ...sampleData, parsedCurrencyCode: 'USD' };
      expect(predicate(differentCurrency)).toBe(false);
    });

    it('handles numeric amount checks correctly', () => {
      const testAmount = (operator: any, minValue: number, maxValue?: number) => {
        const rule: ResolvedSmsRule = {
          mode: 'builder',
          conditions: [{ field: 'amount', operator, minValue, maxValue }],
          actions: { disposition: 'review' },
          priority: 100,
        };
        return RuleMatcher.compileRule(rule)(sampleData);
      };

      expect(testAmount('eq', 1500)).toBe(true);
      expect(testAmount('eq', 1499)).toBe(false);
      expect(testAmount('gt', 1000)).toBe(true);
      expect(testAmount('gt', 2000)).toBe(false);
      expect(testAmount('lt', 2000)).toBe(true);
      expect(testAmount('lt', 1000)).toBe(false);
      expect(testAmount('between', 1000, 2000)).toBe(true);
      expect(testAmount('between', 2000, 3000)).toBe(false);
    });
  });
});
