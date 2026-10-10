import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { triggerPressHaptic } from '@/src/utils/haptics';

jest.mock('@/src/utils/haptics', () => ({
  ...jest.requireActual('@/src/utils/haptics'),
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
});
