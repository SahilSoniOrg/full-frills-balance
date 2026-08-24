import { useUndoableAction } from '@/src/hooks/useUndoableAction';
import { toast, showErrorAlert } from '@/src/utils/alerts';
import { act, renderHook } from '@testing-library/react-native';

jest.mock('@/src/utils/alerts', () => ({
  toast: {
    success: jest.fn(),
  },
  showErrorAlert: jest.fn(),
}));

describe('useUndoableAction', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('runs execute, exits selection, closes modal, and shows an undo toast', async () => {
    const exitSelectionMode = jest.fn();
    const onClose = jest.fn();
    const { result } = renderHook(() => useUndoableAction(exitSelectionMode, onClose));

    const executeFn = jest.fn<Promise<{ count: number }>, []>().mockResolvedValue({ count: 1 });
    const undoFn = jest.fn().mockResolvedValue(undefined);

    await act(async () => {
      await result.current(executeFn, undoFn, res => `Processed ${res.count} items`, {
        undoSuccessMessage: res => `Reverted ${res.count} items`,
      });
    });

    expect(executeFn).toHaveBeenCalled();
    expect(exitSelectionMode).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith(
      'Processed 1 items',
      expect.objectContaining({
        action: expect.objectContaining({ label: 'Undo' }),
      }),
    );

    const toastCall = (toast.success as jest.Mock).mock.calls[0];
    const undoHandler = toastCall[1].action.onPress;

    await act(async () => {
      await undoHandler();
    });

    expect(undoFn).toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Reverted 1 items');
  });

  it('shows an error alert and rethrows on execute failure', async () => {
    const { result } = renderHook(() => useUndoableAction(jest.fn()));

    const executeErr = new Error('Execution failed');
    const executeFn = jest.fn().mockRejectedValue(executeErr);

    await expect(
      act(async () => {
        await result.current(executeFn, jest.fn(), 'Success');
      }),
    ).rejects.toThrow('Execution failed');

    expect(showErrorAlert).toHaveBeenCalledWith(executeErr, 'Operation failed');
  });

  it('routes undo errors through onUndoError, else shows an alert', async () => {
    const exitSelectionMode = jest.fn();
    const { result } = renderHook(() => useUndoableAction(exitSelectionMode));
    const undoErr = new Error('Undo exploded');

    // 1. With custom onUndoError
    const customOnUndoError = jest.fn();
    await act(async () => {
      await result.current(
        jest.fn().mockResolvedValue('ok'),
        jest.fn().mockRejectedValue(undoErr),
        'Success',
        { onUndoError: customOnUndoError },
      );
    });

    const undoHandler1 = (toast.success as jest.Mock).mock.calls[0][1].action.onPress;
    await act(async () => {
      await undoHandler1();
    });

    expect(customOnUndoError).toHaveBeenCalledWith(undoErr);

    // 2. Default showErrorAlert on undo failure
    await act(async () => {
      await result.current(
        jest.fn().mockResolvedValue('ok'),
        jest.fn().mockRejectedValue(undoErr),
        'Success 2',
      );
    });

    const undoHandler2 = (toast.success as jest.Mock).mock.calls[1][1].action.onPress;
    await act(async () => {
      await undoHandler2();
    });

    expect(showErrorAlert).toHaveBeenCalledWith(undoErr, 'Failed to undo action');
  });
});
