/** Callback-level gesture harness. Native recognizer arbitration still needs device tests. */
export type GestureTestEvent = {
  x?: number;
  y?: number;
  translationX?: number;
  translationY?: number;
  absoluteY?: number;
  velocityX?: number;
};

type Callback = (event: GestureTestEvent, success: boolean) => void;

export function createTestGesture() {
  const handlers: Partial<
    Record<'onBegin' | 'onStart' | 'onUpdate' | 'onEnd' | 'onFinalize', Callback>
  > = {};
  const config: Record<string, unknown> = {};
  const gesture = {
    handlers,
    config,
    enabled: (value: boolean) => {
      config.enabled = value;
      return gesture;
    },
    activeOffsetX: (value: number | number[]) => {
      config.activeOffsetX = value;
      return gesture;
    },
    failOffsetY: (value: number | number[]) => {
      config.failOffsetY = value;
      return gesture;
    },
    activateAfterLongPress: (value: number) => {
      config.activateAfterLongPress = value;
      return gesture;
    },
    maxDistance: (value: number) => {
      config.maxDistance = value;
      return gesture;
    },
    maxPointers: (value: number) => {
      config.maxPointers = value;
      return gesture;
    },
    onBegin: (callback: Callback) => {
      handlers.onBegin = callback;
      return gesture;
    },
    onStart: (callback: Callback) => {
      handlers.onStart = callback;
      return gesture;
    },
    onUpdate: (callback: Callback) => {
      handlers.onUpdate = callback;
      return gesture;
    },
    onEnd: (callback: Callback) => {
      handlers.onEnd = callback;
      return gesture;
    },
    onFinalize: (callback: Callback) => {
      handlers.onFinalize = callback;
      return gesture;
    },
  };
  return gesture;
}

export const panGestures: ReturnType<typeof createTestGesture>[] = [];
export const tapGestures: ReturnType<typeof createTestGesture>[] = [];

export const Gesture = {
  Pan: () => {
    const gesture = createTestGesture();
    panGestures.push(gesture);
    return gesture;
  },
  Tap: () => {
    const gesture = createTestGesture();
    tapGestures.push(gesture);
    return gesture;
  },
  Exclusive: (...gestures: ReturnType<typeof createTestGesture>[]) => gestures,
  Simultaneous: (...gestures: ReturnType<typeof createTestGesture>[]) => gestures,
};
