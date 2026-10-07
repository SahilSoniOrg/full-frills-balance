import { ScrollView } from 'react-native';
import { act, fireEvent, render } from '@/src/utils/test-utils';
import { ClockWheel } from './ClockWheel';

jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));

const options = [
  { id: 'zero', label: '00' },
  { id: 'one', label: '01' },
  { id: 'two', label: '02' },
];

it('settles a slow wheel release and preserves option tapping', () => {
  jest.useFakeTimers();
  const onChange = jest.fn();
  const screen = render(
    <ClockWheel options={options} value="one" onChange={onChange} testID="wheel" />,
  );
  fireEvent(screen.getByTestId('wheel'), 'layout', {
    nativeEvent: { layout: { height: 132, width: 100 } },
  });
  const scroll = screen.UNSAFE_getByType(ScrollView);
  fireEvent(scroll, 'scrollBeginDrag', { nativeEvent: { contentOffset: { x: 0, y: 544 } } });
  fireEvent(scroll, 'scrollEndDrag', { nativeEvent: { contentOffset: { x: 0, y: 588 } } });
  act(() => jest.advanceTimersByTime(120));
  expect(onChange).toHaveBeenLastCalledWith('two');
  fireEvent.press(screen.getAllByRole('button', { name: '00' })[0]);
  expect(onChange).toHaveBeenLastCalledWith('zero');
  screen.unmount();
  jest.useRealTimers();
});
