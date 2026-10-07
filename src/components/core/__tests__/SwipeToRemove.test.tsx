import { act, render } from '@testing-library/react-native';
import { Text } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { panGestures } from '@/src/testing/gestureMock';
import { SwipeToRemove } from '../SwipeToRemove';

jest.mock('react-native-gesture-handler', () => ({
  Gesture: jest.requireActual('@/src/testing/gestureMock').Gesture,
  GestureDetector: ({ children }: { children: React.ReactNode }) => children,
}));
jest.mock('@/src/hooks/use-theme', () => ({ useTheme: () => ({ theme: {} }) }));
jest.mock('@/src/hooks/use-reduced-motion', () => ({ useReducedMotion: () => true }));
jest.mock('../AppIcon', () => ({ AppIcon: () => null }));
jest.mock('../AppText', () => ({ AppText: jest.requireActual('react-native').Text }));
jest.mock('@/src/design-system', () => ({ Box: jest.requireActual('react-native').View }));

beforeEach(() => {
  panGestures.length = 0;
  jest.mocked(withTiming).mockImplementation((value, _config, callback) => {
    callback?.(true);
    return value;
  });
});

function setup() {
  const onRemove = jest.fn();
  const screen = render(
    <SwipeToRemove label="Remove allocation" onRemove={onRemove}>
      <Text>Allocation</Text>
    </SwipeToRemove>,
  );
  const pan = panGestures.at(-1)!;
  return { onRemove, screen, pan };
}

it('keeps the row when an active swipe is cancelled beyond the deletion threshold', () => {
  const { onRemove, pan } = setup();
  act(() => {
    pan.handlers.onUpdate?.({ translationX: -100 }, true);
    pan.handlers.onEnd?.({ translationX: -100, velocityX: -1000 }, false);
    pan.handlers.onFinalize?.({ translationX: -100, velocityX: -1000 }, false);
  });
  expect(onRemove).not.toHaveBeenCalled();
  expect(withTiming).toHaveBeenCalledWith(0, expect.anything());
});

it('removes exactly once for a completed swipe even if completion is delivered twice', () => {
  const { onRemove, pan } = setup();
  act(() => {
    pan.handlers.onEnd?.({ translationX: -100, velocityX: 0 }, true);
    pan.handlers.onEnd?.({ translationX: -100, velocityX: 0 }, true);
    pan.handlers.onFinalize?.({ translationX: -100, velocityX: 0 }, true);
  });
  expect(onRemove).toHaveBeenCalledTimes(1);
});

it('keeps a short swipe and allows a later deliberate removal', () => {
  const { onRemove, pan } = setup();
  act(() => {
    pan.handlers.onEnd?.({ translationX: -40, velocityX: 0 }, true);
    pan.handlers.onFinalize?.({ translationX: -40, velocityX: 0 }, true);
  });
  expect(onRemove).not.toHaveBeenCalled();
  act(() => pan.handlers.onEnd?.({ translationX: -80, velocityX: 0 }, true));
  expect(onRemove).toHaveBeenCalledTimes(1);
});

it('keeps removal gesture-based without an extra button in the row', () => {
  const { onRemove, screen } = setup();
  expect(screen.queryByRole('button', { name: 'Remove allocation' })).toBeNull();
  expect(screen.getByText('Allocation')).toBeTruthy();
  expect(onRemove).not.toHaveBeenCalled();
});

it('only claims leftward drags and supports a deliberate leftward flick', () => {
  const { onRemove, pan } = setup();
  expect(pan.config.activeOffsetX).toBe(-20);
  expect(pan.config.failOffsetY).toEqual([-16, 16]);
  act(() => pan.handlers.onEnd?.({ translationX: 20, velocityX: -1000 }, true));
  expect(onRemove).not.toHaveBeenCalled();
  act(() => pan.handlers.onEnd?.({ translationX: -30, velocityX: -1000 }, true));
  expect(onRemove).toHaveBeenCalledTimes(1);
});
