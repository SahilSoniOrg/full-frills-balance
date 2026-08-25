import { renderHook } from '@testing-library/react-native';
import { useSplitEntryState } from '../useSplitEntryState';

describe('useSplitEntryState', () => {
  it('initializes the split total from the imported amount', () => {
    const { result } = renderHook(() => useSplitEntryState('80'));

    expect(result.current.totalAmount).toBe('80');
    expect(result.current.splits).toHaveLength(2);
  });
});
