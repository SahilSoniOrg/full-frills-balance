import { createTestGesture, Gesture } from '../gestureMock';

describe('callback gesture harness', () => {
  it('records fluent recognizer configuration without claiming native arbitration', () => {
    const pan = Gesture.Pan().activeOffsetX([-5, 5]).failOffsetY([-12, 12]);
    const tap = Gesture.Tap().enabled(false);

    expect(pan.config).toEqual({ activeOffsetX: [-5, 5], failOffsetY: [-12, 12] });
    expect(tap.config).toEqual({ enabled: false });
    const exclusive = Gesture.Exclusive(pan, tap);
    expect(exclusive.kind).toBe('exclusive');
    expect(exclusive.gestures[0]).toBe(pan);
    expect(exclusive.gestures[1]).toBe(tap);
    const simultaneous = Gesture.Simultaneous(pan, tap);
    expect(simultaneous[0]).toBe(pan);
    expect(simultaneous[1]).toBe(tap);
    const race = Gesture.Race(pan, tap);
    expect(race.kind).toBe('race');
    expect(race.gestures[0]).toBe(pan);
    expect(race.gestures[1]).toBe(tap);
  });

  it('stores and invokes callback handlers supplied by the test', () => {
    const onUpdate = jest.fn();
    const onEnd = jest.fn();
    const gesture = createTestGesture().onUpdate(onUpdate).onEnd(onEnd);
    const event = { translationX: 14 };

    gesture.handlers.onUpdate?.(event, true);
    gesture.handlers.onEnd?.(event, false);

    expect(onUpdate).toHaveBeenCalledWith(event, true);
    expect(onEnd).toHaveBeenCalledWith(event, false);
  });
});
