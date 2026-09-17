import { act, renderHook } from '@testing-library/react-native';
import {
  getJournalEntryModeSlideDirection,
  JOURNAL_ENTRY_MODE_OPTIONS,
} from '@/src/features/journal/entry/journalEntryMode';
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

  it('shares mode order between presentation and transition direction', () => {
    expect(JOURNAL_ENTRY_MODE_OPTIONS.map(option => option.id)).toEqual([
      'basic',
      'allocation',
      'expert',
      'batch',
    ]);
    expect(getJournalEntryModeSlideDirection('basic', 'expert')).toBe(1);
    expect(getJournalEntryModeSlideDirection('batch', 'allocation')).toBe(-1);
  });

  it('reports the transition direction when changing modes', () => {
    const editor = {
      isGuidedMode: false,
      setIsGuidedMode: jest.fn(),
      lines: [],
    } as any;
    const { result } = renderHook(() => useJournalEntryModeState(editor, 'advanced'));

    act(() => result.current.onToggleMode('allocation'));
    expect(result.current.modeTransitionDir).toBe(-1);

    act(() => result.current.onToggleMode('batch'));
    expect(result.current.modeTransitionDir).toBe(1);
  });
});
