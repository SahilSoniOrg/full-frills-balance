import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { useCalendarDay } from '../useCalendarDay';

describe('calendar projections clock', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(2026, 11, 31, 23, 59, 59));
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('rolls the month/year at local midnight and clears its timer on unmount', () => {
    const { result, unmount } = renderHook(useCalendarDay);
    expect(result.current).toBe(new Date(2026, 11, 31).getTime());
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(new Date(2027, 0, 1).getTime());
    unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('refreshes when foregrounding after missed timers', () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    const { result } = renderHook(useCalendarDay);
    act(() => {
      jest.setSystemTime(new Date(2027, 0, 2, 12));
      listener.mock.calls[0][1]('active');
    });
    expect(result.current).toBe(new Date(2027, 0, 2).getTime());
  });
});
