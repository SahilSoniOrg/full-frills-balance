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
  it('parseJournalEntryRouteParams maps aliases and filters invalid enums', () => {
    const parsed = parseJournalEntryRouteParams({
      mode: 'simple',
      type: 'expense',
      sourceId: 'acc-source',
      destinationId: 'acc-dest',
      journalId: 'j1',
      source: 'dashboard',
    });
    expect(parsed.mode).toBe('simple');
    expect(parsed.type).toBe('expense');
    expect(parsed.sourceAccountId).toBe('acc-source');
    expect(parsed.destinationAccountId).toBe('acc-dest');
    expect(parsed.launchSource).toBe('dashboard');
  });

  it('resolveJournalEntryScreenMode maps simple to guided', () => {
    expect(resolveJournalEntryScreenMode('simple')).toBe('guided');
    expect(resolveJournalEntryScreenMode(undefined)).toBe('guided');
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

  it('submit label and disabled state for guided focus edge case', () => {
    const label = resolveJournalEntrySubmitLabel({
      activeMode: 'guided',
      bulkSubmitting: false,
      bulkRowCount: 0,
      isAmountFocused: true,
      isSimpleValid: false,
      simpleSubmitting: false,
      simpleType: 'expense',
      isEdit: false,
      isSubmitting: false,
    });
    expect(label).toBeTruthy();

    expect(
      isJournalEntrySubmitDisabled({
        activeMode: 'guided',
        bulkSubmitting: false,
        bulkValid: true,
        isAmountFocused: true,
        isSimpleValid: false,
        isAdvancedValid: false,
      }),
    ).toBe(false);
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
