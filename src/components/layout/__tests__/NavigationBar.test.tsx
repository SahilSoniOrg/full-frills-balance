import { NavigationBar } from '@/src/components/layout/NavigationBar';
import { fireEvent, render, screen } from '@/src/testing/render';

describe('NavigationBar', () => {
  it('disables the back button while covered', () => {
    const onPress = jest.fn();
    const { rerender } = render(
      <NavigationBar title="Details" left={{ kind: 'back', onPress }} covered={false} />,
    );

    const backButton = screen.getByTestId('nav-back-button');
    expect(backButton.props.accessibilityState?.disabled).not.toBe(true);
    fireEvent.press(backButton);
    expect(onPress).toHaveBeenCalledTimes(1);

    rerender(<NavigationBar title="Details" left={{ kind: 'back', onPress }} covered />);
    const coveredBackButton = screen.getByTestId('nav-back-button');
    expect(coveredBackButton.props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(coveredBackButton);
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
