import { AccountType } from '@/src/types/enums';

import {
  createDefaultAccountMetadataValues,
  resolveAccountIcon,
  serializeAccountMetadata,
  validateAccountMetadata,
} from '../accountMetadataDomain';

describe('accountMetadataDomain', () => {
  describe('createDefaultAccountMetadataValues', () => {
    it('returns empty string defaults when no existing record is provided', () => {
      const defaults = createDefaultAccountMetadataValues(null);
      expect(defaults.statementDay).toBe('');
      expect(defaults.dueDay).toBe('');
      expect(defaults.creditLimitAmount).toBe('');
      expect(defaults.apr).toBe('');
      expect(defaults.isMinPaymentOnly).toBe(false);
    });

    it('unpacks existing AccountMetadata entity correctly', () => {
      const mockMetadata = {
        statementDay: 15,
        dueDay: 5,
        creditLimitAmount: 5000,
        aprBps: 1850,
        emiDay: 1,
        loanTenureMonths: 24,
        minimumPaymentAmount: 100,
        minimumPaymentPercent: 5,
        minPaymentOnly: true,
        payFromAccountId: 'acc_123',
        notes: 'Test note',
      } as any;

      const values = createDefaultAccountMetadataValues(mockMetadata);
      expect(values.statementDay).toBe('15');
      expect(values.dueDay).toBe('5');
      expect(values.creditLimitAmount).toBe('5000');
      expect(values.apr).toBe('18.5');
      expect(values.isMinPaymentOnly).toBe(true);
      expect(values.payFromAccountId).toBe('acc_123');
      expect(values.notes).toBe('Test note');
    });
  });

  describe('resolveAccountIcon', () => {
    it('uses custom icon if provided', () => {
      expect(resolveAccountIcon(AccountType.ASSET, 'pieChart')).toBe('pieChart');
    });

    it('falls back to tag for category account types', () => {
      expect(resolveAccountIcon(AccountType.EXPENSE)).toBe('tag');
      expect(resolveAccountIcon(AccountType.INCOME)).toBe('tag');
    });

    it('falls back to wallet for non-category account types', () => {
      expect(resolveAccountIcon(AccountType.ASSET)).toBe('wallet');
      expect(resolveAccountIcon(AccountType.LIABILITY)).toBe('wallet');
    });
  });

  describe('validateAccountMetadata', () => {
    it('passes valid liability day and apr ranges', () => {
      const valid = createDefaultAccountMetadataValues();
      valid.statementDay = '15';
      valid.apr = '12.5';
      valid.minimumPaymentPercent = '5';

      const error = validateAccountMetadata(valid, AccountType.LIABILITY);
      expect(error).toBeNull();
    });

    it('rejects statement day out of range', () => {
      const invalid = createDefaultAccountMetadataValues();
      invalid.statementDay = '35';

      const error = validateAccountMetadata(invalid, AccountType.LIABILITY);
      expect(error).toContain('Statement Day must be between');
    });

    it('rejects invalid APR', () => {
      const invalid = createDefaultAccountMetadataValues();
      invalid.apr = '150';

      const error = validateAccountMetadata(invalid, AccountType.LIABILITY);
      expect(error).toContain('APR must be between');
    });

    it('skips validation for income/expense categories', () => {
      const invalid = createDefaultAccountMetadataValues();
      invalid.statementDay = '99';

      const error = validateAccountMetadata(invalid, AccountType.EXPENSE);
      expect(error).toBeNull();
    });
  });

  describe('serializeAccountMetadata', () => {
    it('returns undefined for categories', () => {
      const values = createDefaultAccountMetadataValues();
      values.notes = 'Category note';
      const result = serializeAccountMetadata(values, AccountType.EXPENSE);
      expect(result).toBeUndefined();
    });

    it('serializes numbers and apr bps correctly for non-categories', () => {
      const values = createDefaultAccountMetadataValues();
      values.statementDay = '15';
      values.apr = '18.5';
      values.creditLimitAmount = '10000';

      const payload = serializeAccountMetadata(values, AccountType.LIABILITY);
      expect(payload).toEqual({
        statementDay: 15,
        dueDay: null,
        creditLimitAmount: 10000,
        aprBps: 1850,
        emiDay: null,
        loanTenureMonths: null,
        minimumPaymentAmount: null,
        minimumPaymentPercent: null,
        minPaymentOnly: false,
        payFromAccountId: null,
        notes: null,
      });
    });
  });
});
