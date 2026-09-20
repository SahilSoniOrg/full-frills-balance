import { act, renderHook } from '@testing-library/react-native';
import { JOURNAL_ENTRY_MODE_OPTIONS } from '@/src/features/journal/entry/journalEntryMode';
import { useJournalEntryModeState } from '../useJournalEntryModeState';

jest.mock('@/src/utils/alerts', () => ({ showErrorAlert: jest.fn() }));

describe('useJournalEntryModeState', () => {
  it('does not rewrite the transaction type when visiting Split', () => {
    const setTransactionType = jest.fn();
    const editor = {
      isGuidedMode: true,
      setIsGuidedMode: jest.fn(),
      setTransactionType,
      lines: [],
    } as any;
    const { result } = renderHook(() => useJournalEntryModeState(editor, 'simple'));
    setTransactionType.mockClear();

    act(() => result.current.onToggleMode('allocation'));

    expect(setTransactionType).not.toHaveBeenCalled();
  });

  it('keeps the mode picker order stable', () => {
    expect(JOURNAL_ENTRY_MODE_OPTIONS.map(option => option.id)).toEqual([
      'basic',
      'allocation',
      'expert',
      'batch',
    ]);
  });

  it('explains each mode by transaction count and entry shape', () => {
    expect(JOURNAL_ENTRY_MODE_OPTIONS.map(option => option.subtitle)).toEqual([
      'One transaction with one account on each side',
      'One transaction divided between several categories',
      'One custom entry with several debit and credit lines',
      'Several separate transactions entered together',
    ]);
    expect(
      JOURNAL_ENTRY_MODE_OPTIONS.filter(option => option.recommended).map(option => option.id),
    ).toEqual(['basic']);
  });
});
