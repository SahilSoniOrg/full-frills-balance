import { validateDistinctAccounts } from '@/src/services/accounting/JournalValidation';

describe('JournalValidation', () => {
  describe('validateDistinctAccounts', () => {
    it('returns valid if 2+ accounts', () => {
      expect(validateDistinctAccounts(['A', 'B']).isValid).toBe(true);
    });

    it('returns invalid if same account', () => {
      expect(validateDistinctAccounts(['A', 'A']).isValid).toBe(false);
    });

    it('ignores null/undefined/empty', () => {
      expect(validateDistinctAccounts(['A', '', undefined] as any).isValid).toBe(false);
    });
  });
});
