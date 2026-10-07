import { act, renderHook } from '@testing-library/react-native';
import {
  ChartInteractionProvider,
  useChartInteractionRegistry,
} from '@/src/components/charts/ChartInteractionProvider';
import { panGestures, tapGestures } from '@/src/testing/gestureMock';
import { useChartInteraction } from '../useChartInteraction';

jest.mock('react-native-gesture-handler', () => ({
  Gesture: jest.requireActual('@/src/testing/gestureMock').Gesture,
}));
jest.mock('@/src/utils/haptics', () => ({ triggerHaptic: jest.fn() }));

beforeEach(() => {
  panGestures.length = 0;
  tapGestures.length = 0;
});

function setup() {
  const onInteractionChange = jest.fn();
  const hook = renderHook(
    () => ({
      chart: useChartInteraction({
        getInteractionFromTouch: x => ({ type: 'index', index: Math.round(x) }),
        onInteractionChange,
      }),
      registry: useChartInteractionRegistry(),
    }),
    { wrapper: ChartInteractionProvider },
  );
  return { ...hook, onInteractionChange, pan: panGestures.at(-1)!, tap: tapGestures.at(-1)! };
}

it('does not select when a touch begins and loses recognition to scrolling', () => {
  const { onInteractionChange, pan, tap } = setup();
  act(() => {
    pan.handlers.onBegin?.({ x: 2, y: 3 }, true);
    tap.handlers.onBegin?.({ x: 2, y: 3 }, true);
    pan.handlers.onFinalize?.({ x: 2, y: 3 }, false);
    tap.handlers.onFinalize?.({ x: 2, y: 3 }, false);
  });
  expect(onInteractionChange).not.toHaveBeenCalled();
});

it('selects a successful tap, and a cancelled pan restores that prior selection', () => {
  const { onInteractionChange, pan, tap } = setup();
  act(() => tap.handlers.onEnd?.({ x: 1, y: 0 }, true));
  expect(onInteractionChange).toHaveBeenLastCalledWith({ type: 'index', index: 1 });
  act(() => {
    pan.handlers.onStart?.({ x: 2, y: 0 }, true);
    pan.handlers.onUpdate?.({ x: 3, y: 0 }, true);
    pan.handlers.onFinalize?.({ x: 3, y: 0 }, false);
  });
  expect(onInteractionChange).toHaveBeenLastCalledWith({ type: 'index', index: 1 });
});

it('does not let a failed tap release an active pan, and releases ownership on unmount', () => {
  const { result, unmount, pan, tap } = setup();
  const registry = result.current.registry;
  act(() => pan.handlers.onStart?.({ x: 2, y: 0 }, true));
  act(() => tap.handlers.onFinalize?.({ x: 2, y: 0 }, false));
  expect(registry.isInteracting()).toBe(true);
  unmount();
  expect(registry.isInteracting()).toBe(false);
});

it('uses a symmetric drag threshold and yields to vertical scrolling', () => {
  const { pan } = setup();
  expect(pan.config.activeOffsetX).toEqual([-5, 5]);
  expect(pan.config.failOffsetY).toEqual([-12, 12]);
});

it('measures the current chart position for each outside touch', () => {
  const { result, tap, onInteractionChange } = setup();
  let pageY = 200;
  const measure = jest.fn(
    (
      callback: (
        x: number,
        y: number,
        width: number,
        height: number,
        pageX: number,
        pageY: number,
      ) => void,
    ) => callback(0, 0, 100, 100, 0, pageY),
  );
  Object.assign(result.current.chart.chartRef, { current: { measure } });
  act(() => tap.handlers.onEnd?.({ x: 1, y: 0 }, true));
  pageY = 0;
  act(() => result.current.chart.resetInteraction(50, 250));
  expect(measure).toHaveBeenCalled();
  expect(onInteractionChange).toHaveBeenLastCalledWith({ type: 'none' });
});

it('ignores a delayed outside measurement after a new selection or unmount', () => {
  const { result, tap, onInteractionChange, unmount } = setup();
  const measurements: ((
    x: number,
    y: number,
    width: number,
    height: number,
    pageX: number,
    pageY: number,
  ) => void)[] = [];
  Object.assign(result.current.chart.chartRef, {
    current: {
      measure: (callback: (typeof measurements)[number]) => measurements.push(callback),
    },
  });
  act(() => tap.handlers.onEnd?.({ x: 1, y: 0 }, true));
  act(() => result.current.chart.resetInteraction(200, 200));
  act(() => tap.handlers.onEnd?.({ x: 2, y: 0 }, true));
  act(() => measurements[0](0, 0, 100, 100, 0, 0));
  expect(onInteractionChange).toHaveBeenLastCalledWith({ type: 'index', index: 2 });
  act(() => result.current.chart.resetInteraction(200, 200));
  const count = onInteractionChange.mock.calls.length;
  unmount();
  act(() => measurements[1](0, 0, 100, 100, 0, 0));
  expect(onInteractionChange).toHaveBeenCalledTimes(count);
});

it('keeps ownership of a second chart when the first chart finishes', () => {
  const options = {
    getInteractionFromTouch: () => ({ type: 'none' as const }),
    onInteractionChange: jest.fn(),
  };
  const { result } = renderHook(
    () => {
      useChartInteraction(options);
      useChartInteraction(options);
      return useChartInteractionRegistry();
    },
    { wrapper: ChartInteractionProvider },
  );
  const [first, second] = panGestures;
  act(() => {
    first.handlers.onStart?.({ x: 1, y: 1 }, true);
    second.handlers.onStart?.({ x: 1, y: 1 }, true);
    first.handlers.onFinalize?.({ x: 1, y: 1 }, true);
  });
  expect(result.current.isInteracting()).toBe(true);
  act(() => second.handlers.onFinalize?.({ x: 1, y: 1 }, false));
  expect(result.current.isInteracting()).toBe(false);
});

it('releases ownership and disables both native recognizers when the chart becomes empty', () => {
  const onInteractionChange = jest.fn();
  const { result, rerender } = renderHook(
    ({ enabled }: { enabled: boolean }) => ({
      chart: useChartInteraction({
        enabled,
        panActivation: 'hold',
        getInteractionFromTouch: () => ({ type: 'index', index: 1 }),
        onInteractionChange,
      }),
      registry: useChartInteractionRegistry(),
    }),
    { initialProps: { enabled: true }, wrapper: ChartInteractionProvider },
  );
  const pan = panGestures.at(-1)!;
  expect(pan.config.activateAfterLongPress).toBe(150);
  act(() => pan.handlers.onStart?.({ x: 1, y: 1 }, true));
  rerender({ enabled: false });
  expect(result.current.registry.isInteracting()).toBe(false);
  expect(panGestures.at(-1)?.config.enabled).toBe(false);
  expect(tapGestures.at(-1)?.config.enabled).toBe(false);
  expect(onInteractionChange).toHaveBeenLastCalledWith({ type: 'none' });
});
