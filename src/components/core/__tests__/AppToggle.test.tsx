import { AppToggle } from '@/src/components/core/AppToggle';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { Animated } from 'react-native';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

describe('AppToggle', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(useReducedMotion).mockReturnValue(false);
  });

  it('exposes switch state and toggles through its public control', () => {
    const onValueChange = jest.fn();

    render(
      <AppToggle value={false} onValueChange={onValueChange} accessibilityLabel="Enable feature" />,
    );

    const toggle = screen.getByRole('switch', { name: 'Enable feature' });
    expect(toggle.props.accessibilityState).toEqual({ checked: false, disabled: false });

    fireEvent.press(toggle);

    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('does not start the spring when reduced motion is enabled', () => {
    jest.mocked(useReducedMotion).mockReturnValue(true);
    const spring = jest.spyOn(Animated, 'spring');
    const { rerender } = render(
      <AppToggle value={false} onValueChange={jest.fn()} accessibilityLabel="Feature" />,
    );

    spring.mockClear();
    rerender(<AppToggle value={true} onValueChange={jest.fn()} accessibilityLabel="Feature" />);

    expect(spring).not.toHaveBeenCalled();
    spring.mockRestore();
  });
});
