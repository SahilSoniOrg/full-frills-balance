import { AccountId, EMPTY_ACCOUNT_ID } from '@/src/types/ids';
import TransactionAutoPostRule from '@/src/data/models/TransactionAutoPostRule';
import {
  buildStructuredSmsRuleConditions,
  hydrateSmsRuleForm,
  isSmsRuleFormValid,
  validateSmsRuleRegexPatterns,
} from '@/src/services/sms/smsRuleFormPolicy';

describe('smsRuleFormPolicy', () => {
  describe('hydrateSmsRuleForm', () => {
    it('maps persisted structured conditions and actions into form fields', () => {
      const rule = {
        senderMatch: 'legacy-bank',
        bodyMatch: 'legacy-body',
        conditionsJson: JSON.stringify([
          { field: 'sender', operator: 'contains', value: 'Bank' },
          { field: 'direction', operator: 'is', value: 'debit' },
          { field: 'amount', operator: 'between', minValue: 10, maxValue: 20 },
        ]),
        actionsJson: JSON.stringify({
          disposition: 'review',
          sourceAccountId: 'source' as AccountId,
          journalDescription: 'Review this',
        }),
        priority: 20,
        isActive: false,
        sourceAccountId: EMPTY_ACCOUNT_ID,
        categoryAccountId: 'category' as AccountId,
      } as unknown as TransactionAutoPostRule;

      expect(hydrateSmsRuleForm(rule)).toEqual({
        mode: 'builder',
        legacySenderMatch: 'legacy-bank',
        legacyBodyMatch: 'legacy-body',
        disposition: 'review',
        sourceAccountId: 'source',
        categoryAccountId: 'category',
        journalDescription: 'Review this',
        priority: '20',
        isActive: false,
        builderFields: {
          senderContains: 'Bank',
          bodyContains: '',
          merchantContains: '',
          accountSourceContains: '',
          direction: 'debit',
          currencyCode: '',
          amountOperator: 'between',
          amountValue: '10',
          amountSecondaryValue: '20',
        },
      });
    });

    it('falls back to regex mode for rules without structured conditions', () => {
      const rule = {
        senderMatch: 'BANK.*',
        bodyMatch: '',
        conditionsJson: undefined,
        actionsJson: undefined,
        priority: undefined,
        isActive: true,
        sourceAccountId: EMPTY_ACCOUNT_ID,
        categoryAccountId: EMPTY_ACCOUNT_ID,
      } as unknown as TransactionAutoPostRule;

      expect(hydrateSmsRuleForm(rule)).toMatchObject({
        mode: 'regex',
        legacySenderMatch: 'BANK.*',
        priority: '100',
        isActive: true,
        builderFields: expect.objectContaining({ amountOperator: '' }),
      });
    });
  });

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
