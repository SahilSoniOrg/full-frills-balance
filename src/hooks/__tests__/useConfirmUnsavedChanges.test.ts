import { act, renderHook, waitFor } from '@testing-library/react-native';
import { confirm } from '@/src/utils/alerts';
import { AppNavigation } from '@/src/utils/navigation';
import { useConfirmUnsavedChanges } from '../useConfirmUnsavedChanges';

const mockDispatch = jest.fn();
let mockPreventRemove = false;

jest.mock('expo-router', () => ({
  useNavigation: () => ({ dispatch: mockDispatch }),
}));
jest.mock('expo-router/react-navigation', () => ({
  usePreventRemove: (enabled: boolean) => {
    mockPreventRemove = enabled;
  },
}));
jest.mock('@/src/utils/alerts', () => ({ confirm: { show: jest.fn() } }));
jest.mock('@/src/utils/navigation', () => ({ AppNavigation: { back: jest.fn() } }));

describe('useConfirmUnsavedChanges', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPreventRemove = false;
  });

  it('prompts before leaving a changed hydrated form', async () => {
    const { result, rerender } = renderHook(
      ({ fingerprint }: { fingerprint: string }) =>
        useConfirmUnsavedChanges({ fingerprint, baselineReady: true }),
      { initialProps: { fingerprint: 'initial' } },
    );

    await waitFor(() => expect(result.current.hasBaseline).toBe(true));
    rerender({ fingerprint: 'changed' });
    await waitFor(() => expect(result.current.isDirty).toBe(true));
    expect(mockPreventRemove).toBe(true);

    act(() => result.current.onBack());
    expect(AppNavigation.back).not.toHaveBeenCalled();
    expect(confirm.show).toHaveBeenCalledWith(
      expect.objectContaining({ confirmText: 'Discard changes' }),
    );
  });
});
