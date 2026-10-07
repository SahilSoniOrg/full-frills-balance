import { act, fireEvent, render } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { useScrollSettlement } from '../useScrollSettlement';

function Surface({ onSettle }: { onSettle: (offset: { x: number; y: number }) => void }) {
  const { scrollProps } = useScrollSettlement(onSettle);
  return <ScrollView testID="scroll" {...scrollProps} />;
}
const offset = (x: number) => ({ nativeEvent: { contentOffset: { x, y: x } } });
beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('settles a slow release without momentum exactly once', () => {
  const onSettle = jest.fn();
  const screen = render(<Surface onSettle={onSettle} />);
  fireEvent(screen.getByTestId('scroll'), 'scrollBeginDrag', offset(0));
  fireEvent(screen.getByTestId('scroll'), 'scrollEndDrag', offset(100));
  act(() => jest.advanceTimersByTime(120));
  expect(onSettle).toHaveBeenCalledWith({ x: 100, y: 100 });
  fireEvent(screen.getByTestId('scroll'), 'momentumScrollEnd', offset(100));
  expect(onSettle).toHaveBeenCalledTimes(1);
});

it('waits for momentum to finish rather than committing the release offset', () => {
  const onSettle = jest.fn();
  const screen = render(<Surface onSettle={onSettle} />);
  const scroll = screen.getByTestId('scroll');
  fireEvent(scroll, 'scrollBeginDrag', offset(0));
  fireEvent(scroll, 'scrollEndDrag', offset(30));
  fireEvent(scroll, 'momentumScrollBegin');
  fireEvent.scroll(scroll, offset(100));
  act(() => jest.advanceTimersByTime(500));
  expect(onSettle).not.toHaveBeenCalled();
  fireEvent(scroll, 'momentumScrollEnd', offset(200));
  expect(onSettle).toHaveBeenCalledTimes(1);
  expect(onSettle).toHaveBeenCalledWith({ x: 200, y: 200 });
});

it('uses the final snap offset even if momentum begin is absent', () => {
  const onSettle = jest.fn();
  const screen = render(<Surface onSettle={onSettle} />);
  const scroll = screen.getByTestId('scroll');
  fireEvent(scroll, 'scrollBeginDrag', offset(0));
  fireEvent(scroll, 'scrollEndDrag', offset(30));
  act(() => jest.advanceTimersByTime(100));
  fireEvent.scroll(scroll, offset(100));
  act(() => jest.advanceTimersByTime(100));
  expect(onSettle).not.toHaveBeenCalled();
  act(() => jest.advanceTimersByTime(20));
  expect(onSettle).toHaveBeenCalledWith({ x: 100, y: 100 });
});

it('ignores programmatic scrolling and cancels pending commits on unmount', () => {
  const onSettle = jest.fn();
  const screen = render(<Surface onSettle={onSettle} />);
  const scroll = screen.getByTestId('scroll');
  fireEvent.scroll(scroll, offset(100));
  fireEvent(scroll, 'momentumScrollEnd', offset(100));
  expect(onSettle).not.toHaveBeenCalled();
  fireEvent(scroll, 'scrollBeginDrag', offset(0));
  fireEvent(scroll, 'scrollEndDrag', offset(100));
  screen.unmount();
  act(() => jest.runAllTimers());
  expect(onSettle).not.toHaveBeenCalled();
});
