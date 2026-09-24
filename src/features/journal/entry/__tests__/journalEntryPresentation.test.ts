import {
  isJournalEntrySubmitDisabled,
  parseJournalEntryRouteParams,
  resolveExchangeRatePresentation,
  resolveJournalEntryHeaderTitle,
  resolveJournalEntryScreenMode,
  resolveJournalEntrySubmitLabel,
  resolveJournalEntryValidationHint,
  resolveSimpleAmountTypography,
} from '../journalEntryPresentation';
import { Typography } from '@/src/constants/design-tokens';
import { limitQuickTileAccounts } from '@/src/features/journal/components/accountTilePolicy';

describe('journalEntryPresentation', () => {
  describe('resolveExchangeRatePresentation', () => {
    it('inverts a sub-one INR to USD multiplier into a readable USD to INR quote', () => {
      expect(
        resolveExchangeRatePresentation({
          sourceCurrency: 'INR',
          destinationCurrency: 'USD',
          exchangeRate: 0.0105,
        }),
      ).toEqual({
        sourceCurrency: 'USD',
        destinationCurrency: 'INR',
        exchangeRate: 1 / 0.0105,
      });
    });

    it('keeps rates of one or more in their conversion direction', () => {
      expect(
        resolveExchangeRatePresentation({
          sourceCurrency: 'USD',
          destinationCurrency: 'INR',
          exchangeRate: 95.2,
        }),
      ).toEqual({
        sourceCurrency: 'USD',
        destinationCurrency: 'INR',
        exchangeRate: 95.2,
      });
    });
  });

  it('parses a blank entry route as a clean draft', () => {
    expect(parseJournalEntryRouteParams({})).toEqual({
      mode: undefined,
      type: undefined,
      journalId: undefined,
      sourceAccountId: undefined,
      destinationAccountId: undefined,
      amount: undefined,
      description: undefined,
      notes: undefined,
      smsId: undefined,
      smsRecordId: undefined,
      smsSender: undefined,
      rawSmsBody: undefined,
      initialDate: undefined,
      launchSource: undefined,
    });
  });

  it('parses prefilled widget and SMS route data', () => {
    const parsed = parseJournalEntryRouteParams({
      mode: 'simple',
      type: 'expense',
      sourceId: 'acc-source',
      destinationId: 'acc-dest',
      amount: '12.34',
      notes: 'Imported from SMS: Coffee Shop',
      smsId: 'sms-1',
      smsRecordId: 'inbox-1',
      smsSender: 'HDFCBK',
      rawSmsBody: 'Card payment at Coffee Shop',
      initialDate: '2026-08-25T12:30:00.000Z',
      journalId: 'j1',
      description: 'Coffee Shop',
      source: 'widget',
    });
    expect(parsed.mode).toBe('simple');
    expect(parsed.type).toBe('expense');
    expect(parsed.sourceAccountId).toBe('acc-source');
    expect(parsed.destinationAccountId).toBe('acc-dest');
    expect(parsed.description).toBe('Coffee Shop');
    expect(parsed.amount).toBe('12.34');
    expect(parsed.notes).toBe('Imported from SMS: Coffee Shop');
    expect(parsed.smsId).toBe('sms-1');
    expect(parsed.smsRecordId).toBe('inbox-1');
    expect(parsed.initialDate).toBe('2026-08-25T12:30:00.000Z');
    expect(parsed.launchSource).toBe('widget');
  });

  it('preserves planned/edit/copy journal identity while filtering invalid route enums', () => {
    const parsed = parseJournalEntryRouteParams({
      journalId: 'planned-copy-1',
      mode: 'not-a-mode',
      type: 'not-a-type',
    });

    expect(parsed.journalId).toBe('planned-copy-1');
    expect(parsed.mode).toBeUndefined();
    expect(parsed.type).toBeUndefined();
  });

  it('maps legacy route names to composer views', () => {
    expect(resolveJournalEntryScreenMode('simple')).toBe('basic');
    expect(resolveJournalEntryScreenMode('advanced')).toBe('expert');
    expect(resolveJournalEntryScreenMode('split')).toBe('allocation');
    expect(resolveJournalEntryScreenMode('bulk')).toBe('batch');
    expect(resolveJournalEntryScreenMode(undefined)).toBe('basic');
  });

  it('sizes the amount type from length using design tokens', () => {
    expect(resolveSimpleAmountTypography(3).amountFontSize).toBe(Typography.sizes.jumbo);
    expect(resolveSimpleAmountTypography(7).amountFontSize).toBe(Typography.sizes.xxxl);
    expect(resolveSimpleAmountTypography(10).amountFontSize).toBe(Typography.sizes.xxl);
    expect(resolveSimpleAmountTypography(12).amountFontSize).toBe(Typography.sizes.xl);
  });

  it('resolveJournalEntryHeaderTitle uses one create title across modes', () => {
    expect(resolveJournalEntryHeaderTitle({ isEdit: false })).toBe('New entry');
    expect(resolveJournalEntryHeaderTitle({ isEdit: true })).toBe('Edit entry');
  });

  it('requires a valid basic plan before submit', () => {
    const label = resolveJournalEntrySubmitLabel({
      activeMode: 'basic',
      simpleType: 'expense',
      isEdit: false,
      isSubmitting: false,
    });
    expect(label).toBeTruthy();

    expect(
      isJournalEntrySubmitDisabled({
        activeMode: 'basic',
        validationIssues: [{ code: 'missing_amount', message: 'An amount is required' }],
      }),
    ).toBe(true);
    expect(isJournalEntrySubmitDisabled({ activeMode: 'basic', validationIssues: [] })).toBe(false);
  });

  it('keeps Split disabled when its posting plan or allocation draft has an issue', () => {
    expect(
      isJournalEntrySubmitDisabled({
        activeMode: 'allocation',
        validationIssues: [{ code: 'unbalanced', message: 'Posting plan is not balanced' }],
        splitValidation: { valid: true },
      }),
    ).toBe(true);
    expect(
      isJournalEntrySubmitDisabled({
        activeMode: 'allocation',
        validationIssues: [],
        splitValidation: { valid: false, error: 'sum_mismatch' },
      }),
    ).toBe(true);
    expect(
      isJournalEntrySubmitDisabled({
        activeMode: 'expert',
        validationIssues: [],
        splitValidation: { valid: false, error: 'sum_mismatch' },
      }),
    ).toBe(false);
  });

  describe('resolveJournalEntryValidationHint', () => {
    it('maps the first actionable unresolved intent issue', () => {
      expect(
        resolveJournalEntryValidationHint({
          activeMode: 'basic',
          validationIssues: [
            { code: 'missing_amount', message: 'An amount greater than zero is required' },
            { code: 'missing_source_account', message: 'A source account is required' },
          ],
        }),
      ).toBe('Enter an amount greater than zero.');
      expect(
        resolveJournalEntryValidationHint({
          activeMode: 'basic',
          validationIssues: [
            { code: 'missing_source_account', message: 'A source account is required' },
          ],
        }),
      ).toBe('Choose a source account.');
    });

    it('maps resolved posting-plan issues, including exchange rates', () => {
      expect(
        resolveJournalEntryValidationHint({
          activeMode: 'basic',
          validationIssues: [
            {
              code: 'missing_exchange_rate',
              message: 'A foreign-currency line needs an exchange rate',
            },
          ],
        }),
      ).toBe('Enter an exchange rate for the foreign-currency line.');
      expect(
        resolveJournalEntryValidationHint({
          activeMode: 'expert',
          validationIssues: [{ code: 'unbalanced', message: 'Posting plan is not balanced' }],
        }),
      ).toBe('Make sure the entry balances before saving.');
    });

    it('uses the split validation error contract for allocation mode', () => {
      expect(
        resolveJournalEntryValidationHint({
          activeMode: 'allocation',
          validationIssues: [],
          splitValidation: { valid: false, error: 'missing_split_account' },
        }),
      ).toBe('Choose a category for each split.');
      expect(
        resolveJournalEntryValidationHint({
          activeMode: 'allocation',
          validationIssues: [],
          splitValidation: { valid: false, error: 'sum_mismatch' },
        }),
      ).toBe('Split amounts must add up to the total.');
      expect(
        resolveJournalEntryValidationHint({
          activeMode: 'allocation',
          validationIssues: [],
          splitValidation: { valid: true },
        }),
      ).toBeNull();
      expect(
        resolveJournalEntryValidationHint({
          activeMode: 'allocation',
          validationIssues: [
            {
              code: 'missing_exchange_rate',
              message: 'A foreign-currency line needs an exchange rate',
            },
          ],
          splitValidation: { valid: true },
        }),
      ).toBe('Enter an exchange rate for the foreign-currency line.');
      expect(
        resolveJournalEntryValidationHint({
          activeMode: 'batch',
          validationIssues: [{ code: 'missing_amount', message: 'An amount is required' }],
        }),
      ).toBeNull();
    });
  });

  describe('limitQuickTileAccounts', () => {
    const accounts = Array.from({ length: 30 }, (_, i) => ({
      id: `acc-${i}`,
      name: `Account ${i}`,
    }));

    it('returns all accounts when length is within limit', () => {
      expect(limitQuickTileAccounts(accounts.slice(0, 10), '', 15)).toHaveLength(10);
    });

    it('limits to top N accounts', () => {
      const limited = limitQuickTileAccounts(accounts, '', 15);
      expect(limited).toHaveLength(15);
      expect(limited[0].id).toBe('acc-0');
    });

    it('ensures selected account outside top N is included', () => {
      const limited = limitQuickTileAccounts(accounts, 'acc-25', 15);
      expect(limited).toHaveLength(15);
      expect(limited.some(a => a.id === 'acc-25')).toBe(true);
    });
  });
});
