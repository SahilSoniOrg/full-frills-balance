import { AppButton } from '@/src/components/core/AppButton';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { MotiView } from 'moti';
import { StyleSheet } from 'react-native';

jest.mock('@/src/hooks/use-reduced-motion', () => ({
  useReducedMotion: jest.fn(() => false),
}));

describe('AppButton', () => {
  it('renders with title', () => {
    render(<AppButton onPress={() => {}}>Click Me</AppButton>);
    expect(screen.getByText('Click Me')).toBeTruthy();
  });

  it('renders with JSX interpolated array of text children', () => {
    render(<AppButton onPress={() => {}}>🌿 {'Check in $0 Spend'}</AppButton>);
    expect(screen.getByText('🌿 Check in $0 Spend')).toBeTruthy();
  });

  it('renders with numeric children wrapped in text', () => {
    render(<AppButton onPress={() => {}}>{42}</AppButton>);
    expect(screen.getByText('42')).toBeTruthy();
  });

  it('calls onPress when pressed', () => {
    const onPressMock = jest.fn();
    render(<AppButton onPress={onPressMock}>Press</AppButton>);

    const button = screen.getByText('Press');
    fireEvent.press(button);

    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', () => {
    const onPressMock = jest.fn();
    render(
      <AppButton onPress={onPressMock} disabled>
        Disabled
      </AppButton>,
    );

    const button = screen.getByText('Disabled');
    fireEvent.press(button);

    expect(onPressMock).not.toHaveBeenCalled();
  });

  it('shows loading indicator when loading', () => {
    render(
      <AppButton onPress={() => {}} loading>
        Loading
      </AppButton>,
    );

    // Text should not be visible when loading is true
    expect(screen.queryByText('Loading')).toBeNull();
  });

  it('renders different variants without error', () => {
    const { rerender } = render(
      <AppButton onPress={() => {}} variant="primary">
        Primary
      </AppButton>,
    );
    expect(screen.getByText('Primary')).toBeTruthy();

    rerender(
      <AppButton onPress={() => {}} variant="secondary">
        Secondary
      </AppButton>,
    );
    expect(screen.getByText('Secondary')).toBeTruthy();

    rerender(
      <AppButton onPress={() => {}} variant="ghost">
        Ghost
      </AppButton>,
    );
    expect(screen.getByText('Ghost')).toBeTruthy();

    rerender(
      <AppButton onPress={() => {}} variant="outline">
        Outline
      </AppButton>,
    );
    expect(screen.getByText('Outline')).toBeTruthy();
  });

  it('renders different sizes without error', () => {
    const { rerender } = render(
      <AppButton onPress={() => {}} size="sm">
        Small
      </AppButton>,
    );
    expect(screen.getByText('Small')).toBeTruthy();

    rerender(
      <AppButton onPress={() => {}} size="md">
        Medium
      </AppButton>,
    );
    expect(screen.getByText('Medium')).toBeTruthy();

    rerender(
      <AppButton onPress={() => {}} size="lg">
        Large
      </AppButton>,
    );
    expect(screen.getByText('Large')).toBeTruthy();
  });

  it('still calls caller onPressIn and onPressOut', () => {
    jest.mocked(useReducedMotion).mockReturnValueOnce(true);
    const onPressIn = jest.fn();
    const onPressOut = jest.fn();
    render(
      <AppButton onPress={() => {}} onPressIn={onPressIn} onPressOut={onPressOut}>
        Press
      </AppButton>,
    );

    const button = screen.getByRole('button');
    fireEvent(button, 'pressIn');
    fireEvent(button, 'pressOut');

    expect(onPressIn).toHaveBeenCalledTimes(1);
    expect(onPressOut).toHaveBeenCalledTimes(1);
  });

  it('passes testID to component', () => {
    render(
      <AppButton onPress={() => {}} testID="custom-button">
        Test
      </AppButton>,
    );
    expect(screen.getByTestId('custom-button')).toBeTruthy();
  });

  it('applies layout styles to the touchable container', () => {
    render(
      <AppButton onPress={() => {}} style={{ flex: 1, width: '100%' }}>
        Full width
      </AppButton>,
    );

    expect(screen.getByRole('button')).toHaveStyle({ flex: 1, width: '100%' });
  });

  it('applies visual styles to the animated button surface', () => {
    render(
      <AppButton onPress={() => {}} buttonStyle={{ height: 64, borderRadius: 4 }}>
        Custom surface
      </AppButton>,
    );

    const animatedSurfaces = screen.UNSAFE_getAllByType(MotiView);
    const animatedSurface = animatedSurfaces[animatedSurfaces.length - 1];
    expect(StyleSheet.flatten(animatedSurface.props.style)).toEqual(
      expect.objectContaining({ height: 64, borderRadius: 4 }),
    );
  });
});
