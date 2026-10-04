import {
  resolveAllocationStatus,
  isJournalEntrySubmitDisabled,
  parseJournalEntryRouteParams,
  resolveExchangeRatePresentation,
  resolveJournalEntryHeaderTitle,
  resolveJournalEntryScreenMode,
  resolveJournalEntrySubmitLabel,
  resolveJournalEntryValidationHint,
} from '../journalEntryPresentation';

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
    it.each([
      ['expense', 'Choose the account you paid with.', 'Choose a category for what you spent on.'],
      [
        'income',
        'Choose where the income came from.',
        'Choose the account that received the income.',
      ],
      [
        'transfer',
        'Choose the account to send money from.',
        'Choose the account to deposit money into.',
      ],
    ] as const)(
      'uses transaction-specific account guidance for %s',
      (simpleType, source, destination) => {
        expect(
          resolveJournalEntryValidationHint({
            activeMode: 'basic',
            simpleType,
            validationIssues: [{ code: 'missing_source_account', message: 'A source is required' }],
          }),
        ).toBe(source);
        expect(
          resolveJournalEntryValidationHint({
            activeMode: 'basic',
            simpleType,
            validationIssues: [
              { code: 'missing_destination_account', message: 'A destination is required' },
            ],
          }),
        ).toBe(destination);
      },
    );

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

  describe('resolveAllocationStatus', () => {
    it('hides the status until an amount exists when there is no empty label', () => {
      expect(
        resolveAllocationStatus({
          hasAmount: false,
          balanced: false,
          remaining: 0,
          formattedAmount: '$0',
          emptyLabel: null,
        }).label,
      ).toBeNull();
    });

    it('marks an exact allocation as even and an overrun as over', () => {
      expect(
        resolveAllocationStatus({
          hasAmount: true,
          balanced: true,
          remaining: 0,
          formattedAmount: '$0',
          emptyLabel: 'Enter a total',
        }).tone,
      ).toBe('even');
      expect(
        resolveAllocationStatus({
          hasAmount: true,
          balanced: false,
          remaining: -2,
          formattedAmount: '$2',
          emptyLabel: null,
        }).tone,
      ).toBe('over');
    });
  });
});
