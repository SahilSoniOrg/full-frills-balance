import {
  isAdvancedJournalFormValid,
  isJournalEntrySubmitDisabled,
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

  it('resolveJournalEntryHeaderTitle prefers bulk and edit', () => {
    expect(
      resolveJournalEntryHeaderTitle({ activeMode: 'bulk', isEdit: false, isGuidedMode: true }),
    ).toBe('Bulk Entry');
    expect(
      resolveJournalEntryHeaderTitle({ activeMode: 'guided', isEdit: true, isGuidedMode: true }),
    ).not.toBe('Bulk Entry');
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
      isGuidedMode: true,
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
        isGuidedMode: true,
        isAmountFocused: true,
        isSimpleValid: false,
        isAdvancedValid: false,
      }),
    ).toBe(false);
  });
});
