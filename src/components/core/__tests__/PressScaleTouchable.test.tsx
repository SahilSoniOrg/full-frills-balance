import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { withTiming } from 'react-native-reanimated';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { triggerPressHaptic } from '@/src/design-system/haptics';

jest.mock('@/src/design-system/haptics', () => ({
  ...jest.requireActual('@/src/design-system/haptics'),
  triggerPressHaptic: jest.fn(),
}));

describe('PressScaleTouchable', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps testID, accessibility props and press handlers', () => {
    const onPress = jest.fn();
    const onLongPress = jest.fn();
    render(
      <PressScaleTouchable
        testID="row"
        accessibilityRole="button"
        accessibilityLabel="Open row"
        onPress={onPress}
        onLongPress={onLongPress}
      >
        <Text>Row</Text>
      </PressScaleTouchable>,
    );
    const row = screen.getByTestId('row');
    expect(row.props.accessibilityLabel).toBe('Open row');
    fireEvent.press(row);
    fireEvent(row, 'longPress');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    expect(triggerPressHaptic).not.toHaveBeenCalled();
  });

  it('fires the mapped haptic before onPress when an intent is set', () => {
    const onPress = jest.fn();
    render(
      <PressScaleTouchable testID="chip" haptic="selection" onPress={onPress}>
        <Text>Chip</Text>
      </PressScaleTouchable>,
    );
    fireEvent.press(screen.getByTestId('chip'));
    expect(triggerPressHaptic).toHaveBeenCalledWith('selection');
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onPress = jest.fn();
    render(
      <PressScaleTouchable testID="off" haptic="primary" disabled onPress={onPress}>
        <Text>Off</Text>
      </PressScaleTouchable>,
    );
    fireEvent.press(screen.getByTestId('off'));
    expect(onPress).not.toHaveBeenCalled();
    expect(triggerPressHaptic).not.toHaveBeenCalled();
  });

  it('forwards onPressIn and onPressOut to the caller', () => {
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    render(
      <PressScaleTouchable testID="row" onPressIn={onPressIn} onPressOut={onPressOut}>
        <Text>Row</Text>
      </PressScaleTouchable>,
    );
    const row = screen.getByTestId('row');
    fireEvent(row, 'pressIn');
    fireEvent(row, 'pressOut');
    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('still fires onPress when activeOpacity is 1', () => {
    const onPress = jest.fn();
    render(
      <PressScaleTouchable testID="opaque" activeOpacity={1} onPress={onPress}>
        <Text>Opaque</Text>
      </PressScaleTouchable>,
    );
    fireEvent.press(screen.getByTestId('opaque'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('preserves a static style opacity at rest', () => {
    render(
      <PressScaleTouchable testID="dimmed" style={{ opacity: 0.5 }} onPress={() => {}}>
        <Text>Archived</Text>
      </PressScaleTouchable>,
    );
    expect(screen.getByTestId('dimmed')).toHaveStyle({ opacity: 0.5 });
  });

  it('dims to activeOpacity and restores the static style opacity', () => {
    render(
      <PressScaleTouchable testID="dimmed" style={{ opacity: 0.4 }} onPress={() => {}}>
        <Text>Disabled</Text>
      </PressScaleTouchable>,
    );
    const row = screen.getByTestId('dimmed');
    fireEvent(row, 'pressIn');
    expect(withTiming).toHaveBeenLastCalledWith(0.7, expect.any(Object));
    fireEvent(row, 'pressOut');
    expect(withTiming).toHaveBeenLastCalledWith(0.4, expect.any(Object));
  });

  it('restores the latest style opacity when a delayed press-out runs after a re-render', () => {
    const { rerender } = render(
      <PressScaleTouchable testID="dimmed" style={{ opacity: 1 }} onPress={() => {}}>
        <Text>Pinned</Text>
      </PressScaleTouchable>,
    );
    // Pressable delays onPressOut (130ms min press duration), so a quick tap can
    // release through the handler from the previous render.
    const delayedPressOut = screen
      .getByTestId('dimmed')
      .props.onStartShouldSetResponder.testOnly_pressabilityConfig().onPressOut;

    rerender(
      <PressScaleTouchable testID="dimmed" style={{ opacity: 0.5 }} onPress={() => {}}>
        <Text>Unpinned</Text>
      </PressScaleTouchable>,
    );

    delayedPressOut({});
    expect(withTiming).toHaveBeenLastCalledWith(0.5, expect.any(Object));
  });
});
