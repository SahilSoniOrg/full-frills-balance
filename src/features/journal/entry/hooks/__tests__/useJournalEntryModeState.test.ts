import { act, renderHook } from '@testing-library/react-native';
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
});
