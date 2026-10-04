import { useState } from 'react';
import { fireEvent, render } from '@/src/utils/test-utils';
import { RecurrenceField } from '../RecurrenceField';
import { PlannedPaymentInterval } from '@/src/types/enums';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: () => true,
}));

function Field({
  intervalType,
  initialValue = 1,
}: {
  intervalType?: string;
  initialValue?: number;
}) {
  const [count, setCount] = useState(initialValue);
  const [unit, setUnit] = useState(PlannedPaymentInterval.WEEKLY);
  return (
    <RecurrenceField
      intervalType={intervalType ?? unit}
      value={count}
      onChange={setCount}
      onIntervalTypeChange={setUnit}
      testID="count"
      unitTestID="unit-options"
    />
  );
}

describe('repeat count input', () => {
  it('allows replacing the default count with a seven-week interval', () => {
    const screen = render(<Field />);
    fireEvent.changeText(screen.getByTestId('count'), '');
    expect(screen.getByTestId('count').props.value).toBe('');
    expect(screen.getByText('Enter a whole number from 1 to 9999.')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('count'), '7');
    expect(screen.getByTestId('count').props.value).toBe('7');
    expect(screen.getByRole('button', { name: 'Repeat unit, weeks' })).toBeTruthy();
    expect(screen.queryByText('Enter a whole number from 1 to 9999.')).toBeNull();
  });

  it.each(['0', '-1', '1.5', '10000'])('rejects an invalid count: %s', value => {
    const screen = render(<Field />);
    fireEvent.changeText(screen.getByTestId('count'), value);
    expect(screen.getByText('Enter a whole number from 1 to 9999.')).toBeTruthy();
  });

  it('loads an existing count and changes the selected unit without duplicating the sentence', () => {
    const screen = render(<Field initialValue={3} />);
    expect(screen.getByText('Every')).toBeTruthy();
    expect(screen.getByText('weeks')).toBeTruthy();
    screen.rerender(<Field initialValue={3} intervalType="MONTHLY" />);
    expect(screen.getByText('months')).toBeTruthy();
    expect(screen.getByTestId('count').props.value).toBe('3');
  });

  it('reveals the unit choices inline and keeps the count when choosing months', () => {
    const screen = render(<Field initialValue={2} />);
    expect(screen.queryByRole('tab', { name: 'months' })).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Repeat unit, weeks' }));
    fireEvent(screen.getByTestId('unit-options'), 'layout', {
      nativeEvent: { layout: { width: 260, height: 44 } },
    });
    fireEvent.press(screen.getByRole('tab', { name: 'months' }));
    expect(screen.getByRole('button', { name: 'Repeat unit, months' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'months' })).toBeNull();
    expect(screen.getByTestId('count').props.value).toBe('2');
  });
});
