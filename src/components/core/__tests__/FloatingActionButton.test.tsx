import { FloatingActionButton } from '@/src/components/core/FloatingActionButton';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { triggerHaptic } from '@/src/utils/haptics';

jest.mock('@/src/utils/haptics', () => ({
  triggerHaptic: jest.fn(),
}));

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

describe('FloatingActionButton', () => {
  it('triggers a light haptic and calls onPress', () => {
    const onPress = jest.fn();
    render(<FloatingActionButton onPress={onPress} />);

    fireEvent.press(screen.getByTestId('fab-button'));

    expect(triggerHaptic).toHaveBeenCalledWith('light');
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
