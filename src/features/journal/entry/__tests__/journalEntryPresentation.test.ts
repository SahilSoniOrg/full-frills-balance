import {
  isAdvancedJournalFormValid,
  isJournalEntrySubmitDisabled,
  limitQuickTileAccounts,
  parseJournalEntryRouteParams,
  resolveJournalEntryHeaderTitle,
  resolveJournalEntryScreenMode,
  resolveJournalEntrySubmitLabel,
} from '../journalEntryPresentation';

describe('journalEntryPresentation', () => {
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

  it('resolveJournalEntryHeaderTitle uses one create title across modes', () => {
    expect(resolveJournalEntryHeaderTitle({ isEdit: false })).toBe('New journal');
    expect(resolveJournalEntryHeaderTitle({ isEdit: true })).toBe('Edit journal');
  });

  it('isAdvancedJournalFormValid requires balance, description, and complete lines', () => {
    expect(
      isAdvancedJournalFormValid({
        isBalanced: true,
        description: 'x',
        lines: [{ accountId: 'a', amount: '1' }],
        isSubmitting: false,
      }),
    ).toBe(true);
    expect(
      isAdvancedJournalFormValid({
        isBalanced: true,
        description: ' ',
        lines: [{ accountId: 'a', amount: '1' }],
        isSubmitting: false,
      }),
    ).toBe(false);
  });

  it('requires a valid basic plan before submit', () => {
    const label = resolveJournalEntrySubmitLabel({
      activeMode: 'basic',
      simpleSubmitting: false,
      simpleType: 'expense',
      isEdit: false,
      isSubmitting: false,
    });
    expect(label).toBeTruthy();

    expect(
      isJournalEntrySubmitDisabled({
        activeMode: 'basic',
        isSimpleValid: false,
        isAdvancedValid: false,
      }),
    ).toBe(true);
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
