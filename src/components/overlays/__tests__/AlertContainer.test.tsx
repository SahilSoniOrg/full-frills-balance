import { AlertContainer } from '../AlertContainer';
import { alert, confirm } from '@/src/services/feedback/alerts';
import { act, fireEvent, render, screen } from '@/src/testing/render';

describe('AlertContainer', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('closes a superseded alert once and shows the replacement without ID collisions', () => {
    const firstOnClose = jest.fn();
    const secondOnClose = jest.fn();
    jest.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    render(<AlertContainer />);

    act(() => {
      alert.show({ title: 'First', message: 'First body', onClose: firstOnClose });
    });
    expect(screen.getByText('First body')).toBeTruthy();

    act(() => {
      alert.show({ title: 'Second', message: 'Second body', onClose: secondOnClose });
    });

    expect(firstOnClose).toHaveBeenCalledTimes(1);
    expect(secondOnClose).not.toHaveBeenCalled();
    expect(screen.getByText('Second body')).toBeTruthy();
    expect(screen.queryByText('First body')).toBeNull();
  });

  it('clears confirm dialog state in finally even when onConfirm throws', () => {
    const throwingConfirm = jest.fn(() => {
      throw new Error('confirm failure');
    });

    render(<AlertContainer />);

    act(() => {
      confirm.show({
        title: 'Delete',
        message: 'Delete this item?',
        confirmText: 'Remove',
        onConfirm: throwingConfirm,
      });
    });

    expect(screen.getByText('Delete this item?')).toBeTruthy();

    expect(() => {
      fireEvent.press(screen.getByTestId('confirmation-primary-action'));
    }).toThrow('confirm failure');
    act(() => {});

    expect(screen.queryByText('Delete this item?')).toBeNull();

    act(() => {
      confirm.show({
        title: 'Next',
        message: 'Second prompt still opens',
        onConfirm: jest.fn(),
      });
    });
    expect(screen.getByText('Second prompt still opens')).toBeTruthy();
  });
});
