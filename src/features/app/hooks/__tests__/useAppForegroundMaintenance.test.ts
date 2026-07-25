import { useAppForegroundMaintenance } from '@/src/features/app/hooks/useAppForegroundMaintenance';
import { rebuildQueueService } from '@/src/services/RebuildQueueService';
import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';

jest.mock('@/src/services/RebuildQueueService', () => ({
  rebuildQueueService: { flush: jest.fn().mockResolvedValue(undefined) },
}));

describe('useAppForegroundMaintenance', () => {
  let changeHandler: (state: string) => void;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    (AppState.addEventListener as jest.Mock) = jest.fn((_event, handler) => {
      changeHandler = handler;
      return { remove: jest.fn() };
    });
    AppState.currentState = 'active';
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('debounces rebuild flush when returning to foreground', async () => {
    AppState.currentState = 'background';
    renderHook(() => useAppForegroundMaintenance());

    act(() => {
      changeHandler('active');
    });

    expect(rebuildQueueService.flush).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(500);
    });

    expect(rebuildQueueService.flush).toHaveBeenCalledTimes(1);
  });
});
