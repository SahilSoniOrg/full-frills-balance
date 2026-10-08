import { clearToastListener, setToastListener, ToastPayload } from '@/src/utils/alerts';
import { act, renderHook } from '@testing-library/react-native';
import { useToastListener } from '../useToastListener';

// Mock alerts utility
jest.mock('@/src/utils/alerts', () => ({
  setToastListener: jest.fn(),
  clearToastListener: jest.fn(),
}));

describe('useToastListener', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should set and clear toast listener', () => {
    const { unmount } = renderHook(() => useToastListener());

    expect(setToastListener).toHaveBeenCalled();
    unmount();
    expect(clearToastListener).toHaveBeenCalled();
  });

  it('should add a toast when listener is called', () => {
    const { result } = renderHook(() => useToastListener());

    // Extract the listener passed to setToastListener
    const listener = (setToastListener as jest.Mock).mock.calls[0][0];

    const payload: ToastPayload = {
      message: 'Test Toast',
      type: 'success',
      duration: 3000,
    };

    act(() => {
      listener(payload);
    });

    expect(result.current.toasts).toHaveLength(1);
    expect(result.current.toasts[0].message).toBe('Test Toast');
  });

  it('should remove toast after duration', () => {
    const { result } = renderHook(() => useToastListener());
    const listener = (setToastListener as jest.Mock).mock.calls[0][0];

    act(() => {
      listener({ message: 'Test', type: 'info', duration: 1000 });
    });

    expect(result.current.toasts).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(1000);
    });

    expect(result.current.toasts).toHaveLength(0);
  });

  it('should clear pending dismiss timers on unmount', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const { result, unmount } = renderHook(() => useToastListener());
    const listener = (setToastListener as jest.Mock).mock.calls[0][0];

    act(() => {
      listener({ message: 'First', type: 'info', duration: 5000 });
      listener({ message: 'Second', type: 'info', duration: 5000 });
    });

    expect(result.current.toasts).toHaveLength(2);

    unmount();

    expect(clearToastListener).toHaveBeenCalled();
    expect(clearTimeoutSpy).toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5000);
    });

    // Timers were cleared; advancing time must not throw or resurrect toasts.
    expect(clearToastListener).toHaveBeenCalledTimes(1);

    clearTimeoutSpy.mockRestore();
  });

  it('replaces a keyed notice without dismissal and gives its successor a fresh lifetime', () => {
    const { result } = renderHook(() => useToastListener());
    const listener = jest.mocked(setToastListener).mock.calls[0][0];
    const oldDismissed = jest.fn();
    const newDismissed = jest.fn();
    act(() => {
      listener({
        key: 'app-update',
        message: 'Available',
        type: 'info',
        duration: 1000,
        onDismiss: oldDismissed,
      });
      listener({ message: 'Saved', type: 'success', duration: 5000 });
    });
    const oldNotice = result.current.toasts[0];
    act(() => {
      jest.advanceTimersByTime(800);
      listener({
        key: 'app-update',
        message: 'Downloaded',
        type: 'info',
        duration: 2000,
        onDismiss: newDismissed,
      });
      oldNotice.dismiss();
      jest.advanceTimersByTime(300);
    });
    expect(result.current.toasts.map(t => t.message)).toEqual(['Saved', 'Downloaded']);
    expect(oldDismissed).not.toHaveBeenCalled();
    act(() => result.current.toasts[1].dismiss());
    expect(newDismissed).toHaveBeenCalledTimes(1);
    expect(result.current.toasts.map(t => t.message)).toEqual(['Saved']);
  });
});
