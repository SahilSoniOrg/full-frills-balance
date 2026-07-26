import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/domain';
import {
  buildStructuredSmsRuleConditions,
  isSmsRuleFormValid,
  validateSmsRuleRegexPatterns,
} from '@/src/services/sms/smsRuleFormPolicy';

describe('smsRuleFormPolicy', () => {
  describe('buildStructuredSmsRuleConditions', () => {
    it('builds sender and amount between conditions', () => {
      const conditions = buildStructuredSmsRuleConditions({
        senderContains: 'BANK',
        bodyContains: '',
        merchantContains: '',
        accountSourceContains: '',
        direction: '',
        currencyCode: 'usd',
        amountOperator: 'between',
        amountValue: '10',
        amountSecondaryValue: '20',
      });

      expect(conditions).toEqual(
        expect.arrayContaining([
          { field: 'sender', operator: 'contains', value: 'BANK' },
          { field: 'currency', operator: 'is', value: 'USD' },
          { field: 'amount', operator: 'between', minValue: 10, maxValue: 20 },
        ]),
      );
    });
  });

  describe('isSmsRuleFormValid', () => {
    const base = {
      mode: 'builder' as const,
      legacySenderMatch: '',
      legacyBodyMatch: '',
      structuredConditions: [
        { field: 'sender' as const, operator: 'contains' as const, value: 'x' },
      ],
      amountOperator: '' as const,
      amountValue: '',
      amountSecondaryValue: '',
      priority: '100',
      disposition: 'auto_post' as const,
      sourceAccountId: 'src' as AccountId,
      categoryAccountId: 'cat' as AccountId,
      emptyAccountId: EMPTY_ACCOUNT_ID,
    };

    it('requires accounts for auto_post', () => {
      expect(
        isSmsRuleFormValid({
          ...base,
          sourceAccountId: EMPTY_ACCOUNT_ID,
        }),
      ).toBe(false);
      expect(isSmsRuleFormValid(base)).toBe(true);
    });

    it('requires regex sender in legacy mode', () => {
      expect(
        isSmsRuleFormValid({
          ...base,
          mode: 'regex',
          structuredConditions: [],
        }),
      ).toBe(false);
    });
  });

  describe('validateSmsRuleRegexPatterns', () => {
    it('rejects invalid regex', () => {
      expect(validateSmsRuleRegexPatterns('(')).toBe(false);
      expect(validateSmsRuleRegexPatterns('bank', 'valid')).toBe(true);
    });
  });
});
