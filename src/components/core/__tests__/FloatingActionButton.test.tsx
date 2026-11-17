import { FloatingActionButton } from '@/src/components/core/FloatingActionButton';
import { fireEvent, render, screen } from '@/src/testing/render';
import { triggerPressHaptic } from '@/src/design-system/haptics';

jest.mock('@/src/design-system/haptics', () => ({
  triggerPressHaptic: jest.fn(),
}));

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

describe('FloatingActionButton', () => {
  it('triggers a primary haptic and calls onPress', () => {
    const onPress = jest.fn();
    render(<FloatingActionButton onPress={onPress} />);

    fireEvent.press(screen.getByTestId('fab-button'));

    expect(triggerPressHaptic).toHaveBeenCalledWith('primary');
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
