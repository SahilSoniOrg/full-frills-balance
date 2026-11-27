import { DisclosureToggle } from '@/src/components/core/DisclosureToggle';
import { fireEvent, render, screen } from '@/src/testing/render';

describe('DisclosureToggle', () => {
  it('toggles on press and supports long-press', () => {
    const onToggle = jest.fn();
    const onLongPress = jest.fn();
    render(
      <DisclosureToggle
        label="Assets"
        meta={3}
        expanded={false}
        onToggle={onToggle}
        onLongPress={onLongPress}
        testID="disclosure"
      />,
    );

    expect(screen.getByText('Assets')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    fireEvent.press(screen.getByTestId('disclosure'));
    expect(onToggle).toHaveBeenCalled();
    fireEvent(screen.getByTestId('disclosure'), 'longPress');
    expect(onLongPress).toHaveBeenCalled();
  });
});
