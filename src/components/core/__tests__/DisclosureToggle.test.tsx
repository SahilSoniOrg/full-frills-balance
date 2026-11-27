import { AppText } from '@/src/components/core/AppText';
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

  it('keeps label and meta on the left when trailing is set', () => {
    const { getByText, getByTestId } = render(
      <DisclosureToggle
        label="Assets"
        meta={18}
        trailing={<AppText testID="section-total">1Cr</AppText>}
        expanded
        onToggle={jest.fn()}
        testID="disclosure"
      />,
    );

    expect(getByText('Assets')).toBeTruthy();
    expect(getByText('18')).toBeTruthy();
    expect(getByTestId('section-total')).toBeTruthy();
  });
});
