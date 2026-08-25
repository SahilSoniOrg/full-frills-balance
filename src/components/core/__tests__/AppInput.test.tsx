import { AppInput } from '@/src/components/core/AppInput';
import { Spacing } from '@/src/constants';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { StyleSheet } from 'react-native';

jest.mock('@/src/components/core/AppIcon', () => ({
  AppIcon: () => null,
}));

describe('AppInput', () => {
  it('renders label and placeholder', () => {
    render(<AppInput label="Username" placeholder="Enter username" />);
    expect(screen.getByText('Username')).toBeTruthy();
    expect(screen.getByPlaceholderText('Enter username')).toBeTruthy();
  });

  it('handles text input', () => {
    const onChangeText = jest.fn();
    render(<AppInput placeholder="Type here" onChangeText={onChangeText} />);

    const input = screen.getByPlaceholderText('Type here');
    fireEvent.changeText(input, 'New Text');

    expect(onChangeText).toHaveBeenCalledWith('New Text');
  });

  it('displays error message', () => {
    render(<AppInput label="Field" error="Invalid input" />);
    expect(screen.getByText('Invalid input')).toBeTruthy();
  });

  it('does not leak wrapper props to the native TextInput', () => {
    render(
      <AppInput
        label="Search"
        error="Required"
        variant="minimal"
        leftIcon="search"
        containerStyle={{ marginTop: 12 }}
        inputStyle={{ fontSize: 20 }}
        placeholder="Find"
      />,
    );

    const input = screen.getByPlaceholderText('Find');

    expect(input.props.label).toBeUndefined();
    expect(input.props.error).toBeUndefined();
    expect(input.props.variant).toBeUndefined();
    expect(input.props.leftIcon).toBeUndefined();
    expect(input.props.containerStyle).toBeUndefined();
    expect(input.props.inputStyle).toBeUndefined();
    expect(StyleSheet.flatten(input.props.style).fontSize).toBe(20);
  });

  it('keeps multiline text aligned to the top', () => {
    render(<AppInput multiline placeholder="Notes" />);

    const input = screen.getByPlaceholderText('Notes');
    const flattenedStyle = StyleSheet.flatten(input.props.style);

    expect(flattenedStyle.textAlignVertical).toBe('top');
  });

  it('reserves space for the calculator icon without dropping custom input styles', () => {
    render(
      <AppInput calculator inputStyle={{ paddingRight: 4, fontSize: 18 }} placeholder="Amount" />,
    );

    const input = screen.getByPlaceholderText('Amount');
    const flattenedStyle = StyleSheet.flatten(input.props.style);

    expect(flattenedStyle.paddingRight).toBe(Spacing.xxxl + Spacing.sm);
    expect(flattenedStyle.fontSize).toBe(18);
  });
});
