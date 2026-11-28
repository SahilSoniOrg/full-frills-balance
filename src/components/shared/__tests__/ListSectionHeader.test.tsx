import { IconButton } from '@/src/components/core';
import { ListSectionHeader } from '@/src/components/shared/ListSectionHeader';
import { fireEvent, render, screen } from '@/src/testing/render';
import { Text } from 'react-native';

describe('ListSectionHeader', () => {
  it('renders title, count badge, and amount with a far-right chevron', () => {
    const onToggle = jest.fn();
    const { UNSAFE_getByType } = render(
      <ListSectionHeader
        title="Income Categories"
        count={1}
        expanded
        onToggle={onToggle}
        amount={<Text>₹0</Text>}
        testID="section-control"
      />,
    );

    expect(screen.getByText('Income Categories')).toBeTruthy();
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('₹0')).toBeTruthy();
    fireEvent.press(screen.getByTestId('section-control'));
    expect(onToggle).toHaveBeenCalledTimes(1);

    // Chevron stays tappable for sighted users but is not a second a11y control.
    expect(screen.queryByLabelText('Collapse Income Categories section')).toBeNull();
    fireEvent.press(UNSAFE_getByType(IconButton));
    expect(onToggle).toHaveBeenCalledTimes(2);
  });

  it('renders a static people-style header without a chevron', () => {
    render(<ListSectionHeader title="People" count={3} testID="people-section" />);

    expect(screen.getByText('People')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.queryByLabelText(/Expand People section|Collapse People section/)).toBeNull();
  });

  it('supports leading mark and actions before the chevron', () => {
    const onCreate = jest.fn();
    render(
      <ListSectionHeader
        title="Assets"
        count={2}
        expanded
        onToggle={jest.fn()}
        leading={<Text testID="section-dot">•</Text>}
        actions={
          <Text testID="create-action" onPress={onCreate}>
            +
          </Text>
        }
      />,
    );

    expect(screen.getByTestId('section-dot')).toBeTruthy();
    fireEvent.press(screen.getByTestId('create-action'));
    expect(onCreate).toHaveBeenCalled();
    expect(screen.queryByLabelText('Collapse Assets section')).toBeNull();
  });

  it('keeps long-press when onToggle is omitted', () => {
    const onLongPress = jest.fn();
    render(
      <ListSectionHeader title="Assets" count={0} onLongPress={onLongPress} testID="section" />,
    );

    fireEvent(screen.getByTestId('section'), 'longPress');
    expect(onLongPress).toHaveBeenCalled();
    expect(screen.queryByLabelText(/Expand Assets section|Collapse Assets section/)).toBeNull();
  });

  it('does not force an accessibilityLabel when amount is present', () => {
    render(
      <ListSectionHeader
        title="Income Categories"
        count={1}
        expanded
        onToggle={jest.fn()}
        amount={<Text>₹0</Text>}
        testID="section-control"
      />,
    );

    expect(screen.getByTestId('section-control').props.accessibilityLabel).toBeUndefined();
    expect(screen.getByText('₹0')).toBeTruthy();
  });

  it('disables a forced chevron when there is no onToggle', () => {
    const { UNSAFE_getByType } = render(
      <ListSectionHeader title="People" count={3} showChevron expanded />,
    );

    expect(UNSAFE_getByType(IconButton).props.disabled).toBe(true);
  });
});
