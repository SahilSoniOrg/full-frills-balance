import type { ReactNode } from 'react';
import { AppInputField } from '@/src/components/core/AppInputField';
import { fireEvent, render } from '@/src/utils/test-utils';
import { ScheduleSheet } from '../schedule/ScheduleSheet';
import type { ScheduleValue } from '../schedule/types';
import { getLayoutPath } from '@/src/testing/layoutAssertions';

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

jest.mock('@/src/components/core/AppButton', () => {
  // Jest hoists this factory; inline requires are needed to avoid out-of-scope captures.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ReactRuntime = require('react');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pressable } = require('react-native');
  return {
    AppButton: ({
      children,
      onPress,
      disabled,
      accessibilityLabel,
    }: {
      children: ReactNode;
      onPress: () => void;
      disabled?: boolean;
      accessibilityLabel?: string;
    }) =>
      ReactRuntime.createElement(
        Pressable,
        { accessibilityRole: 'button', accessibilityLabel, disabled, onPress },
        children,
      ),
  };
});

jest.mock('@/src/components/overlays/ModalSurface', () => ({
  ModalSurface: (props: {
    visible: boolean;
    children: ReactNode;
    footer?: ReactNode;
    onClose: () => void;
  }) => {
    // Jest hoists this factory; inline requires are needed to avoid out-of-scope captures.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ReactRuntime = require('react');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Pressable } = require('react-native');
    return props.visible
      ? ReactRuntime.createElement(
          ReactRuntime.Fragment,
          null,
          ReactRuntime.createElement(Pressable, {
            accessibilityRole: 'button',
            accessibilityLabel: 'Close dialog',
            onPress: props.onClose,
          }),
          props.children,
          props.footer,
        )
      : null;
  },
}));

const startDate = new Date(2026, 0, 31, 12).getTime();
const initial: ScheduleValue = {
  intervalType: 'MONTHLY',
  intervalN: 1,
  recurrenceDay: 31,
  recurrenceMonth: 5,
};

function setup(value = initial) {
  const onDone = jest.fn();
  const onClose = jest.fn();
  const screen = render(
    <ScheduleSheet visible value={value} startDate={startDate} onDone={onDone} onClose={onClose} />,
  );
  return { screen, onDone, onClose };
}

describe('ScheduleSheet draft behavior', () => {
  it('keeps schedule day labels and tab borders stable when selection changes', () => {
    const { screen } = setup();
    const day = getLayoutPath(screen.getByText('5'));
    const month = getLayoutPath(screen.getByText('Month'));
    fireEvent.press(screen.getByTestId('schedule-day-5'));
    expect(getLayoutPath(screen.getByText('5'))).toEqual(day);
    fireEvent.press(screen.getByTestId('schedule-interval-type-item-WEEKLY'));
    expect(getLayoutPath(screen.getByText('Month'))).toEqual(month);
  });
  it('commits a changed schedule only after Done', () => {
    const { screen, onDone } = setup();
    fireEvent.press(screen.getByTestId('schedule-day-5'));
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledWith({ ...initial, recurrenceDay: 5 });
  });

  it('closes without committing when cancelled', () => {
    const { screen, onDone, onClose } = setup();
    fireEvent.press(screen.getByTestId('schedule-day-5'));
    fireEvent.press(screen.getByLabelText('Close dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onDone).not.toHaveBeenCalled();
  });

  it('preserves uncommitted edits when the parent recreates an equivalent value', () => {
    const onDone = jest.fn();
    const onClose = jest.fn();
    const screen = render(
      <ScheduleSheet
        visible
        value={initial}
        startDate={startDate}
        onDone={onDone}
        onClose={onClose}
      />,
    );
    fireEvent.press(screen.getByTestId('schedule-day-5'));
    screen.rerender(
      <ScheduleSheet
        visible
        value={{ ...initial }}
        startDate={startDate}
        onDone={onDone}
        onClose={onClose}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledWith({ ...initial, recurrenceDay: 5 });
  });

  it('resets the draft after closing and reopening', () => {
    const onDone = jest.fn();
    const onClose = jest.fn();
    const screen = render(
      <ScheduleSheet
        visible
        value={initial}
        startDate={startDate}
        onDone={onDone}
        onClose={onClose}
      />,
    );
    fireEvent.press(screen.getByTestId('schedule-day-5'));
    screen.rerender(
      <ScheduleSheet
        visible={false}
        value={initial}
        startDate={startDate}
        onDone={onDone}
        onClose={onClose}
      />,
    );
    screen.rerender(
      <ScheduleSheet
        visible
        value={initial}
        startDate={startDate}
        onDone={onDone}
        onClose={onClose}
      />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledWith(initial);
  });

  it('normalizes the selected day to the start weekday when switching to week', () => {
    const { screen } = setup();
    fireEvent.press(screen.getByTestId('schedule-interval-type-item-WEEKLY'));
    expect(screen.getByTestId('schedule-weekday-6').props.accessibilityState.selected).toBe(true);
    expect(screen.queryByTestId('schedule-day-31')).toBeNull();
  });

  it('uses the anchor month when switching into year and clears the hidden month on month', () => {
    const { screen } = setup();
    fireEvent.press(screen.getByTestId('schedule-interval-type-item-YEARLY'));
    expect(screen.getByTestId('schedule-month-1').props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByTestId('schedule-interval-type-item-MONTHLY'));
    expect(screen.queryByTestId('schedule-month-1')).toBeNull();
  });

  it('recovers an invalid repeat count through the stepper', () => {
    const invalid = { ...initial, intervalN: 0 };
    const { screen, onDone } = setup(invalid);
    fireEvent.press(screen.getByLabelText('Increase repeat count'));
    fireEvent.press(screen.getByRole('button', { name: 'Done' }));
    expect(onDone).toHaveBeenCalledWith({ ...invalid, intervalN: 1 });
  });

  it.each([
    ['DAILY', 'day'],
    ['WEEKLY', 'week'],
    ['MONTHLY', 'month'],
    ['YEARLY', 'year'],
  ] as const)('keeps the repeat count input constrained for %s', (interval, unit) => {
    const { screen } = setup();
    fireEvent.press(screen.getByTestId(`schedule-interval-type-item-${interval}`));

    const countInput = screen.UNSAFE_getByType(AppInputField);
    expect(countInput.props.width).toBe(56);
    expect(countInput.props.style).toBeUndefined();
    expect(screen.getByLabelText('Increase repeat count')).toBeTruthy();
    expect(screen.getAllByText(unit).length).toBeGreaterThan(0);
  });
});
