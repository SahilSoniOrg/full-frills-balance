import { fireEvent, render } from '@/src/utils/test-utils';
import { FormRow } from '../FormRow';
import { AppToggle } from '@/src/components/core/AppToggle';
import { AppIcon, Icon } from '@/src/components/core';
import { StyleSheet } from 'react-native';

describe('FormRow', () => {
  it('shows the placeholder when value is empty and value when set', () => {
    const screen = render(
      <FormRow icon={Icon.Bank} title="From" value="" placeholder="Choose account" />,
    );
    expect(screen.getByText('Choose account')).toBeTruthy();
    screen.rerender(
      <FormRow icon={Icon.Bank} title="From" value="Salary" placeholder="Choose account" />,
    );
    expect(screen.getByText('Salary')).toBeTruthy();
    expect(screen.queryByText('Choose account')).toBeNull();
  });

  it('shows a clear control only with a value and invokes it', () => {
    const onClear = jest.fn();
    const screen = render(
      <FormRow icon={Icon.Calendar} title="Ends" value="Oct 4" onClear={onClear} />,
    );
    fireEvent.press(screen.getByRole('button', { name: 'Clear Ends' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('keeps row activation and clearing as independent accessible actions', () => {
    const onPress = jest.fn();
    const onClear = jest.fn();
    const screen = render(
      <FormRow
        icon={Icon.Calendar}
        title="Ends"
        value="Oct 4"
        onPress={onPress}
        onClear={onClear}
      />,
    );
    const rowButton = screen.getByRole('button', { name: 'Ends, Oct 4' });
    const clearButton = screen.getByRole('button', { name: 'Clear Ends' });

    expect(rowButton.findAll(node => node === clearButton)).toHaveLength(0);
    fireEvent.press(rowButton);
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.press(clearButton);
    expect(onClear).toHaveBeenCalledTimes(1);
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('keeps long values readable by truncating within the row and retains their full label', () => {
    const value = 'A very long account or category name '.repeat(4);
    const screen = render(
      <FormRow icon={Icon.Bank} title="Funding" value={value} onPress={() => {}} />,
    );

    const valueNode = screen.getByText(value);
    expect(valueNode.props.numberOfLines).toBe(1);
    let ancestor = valueNode.parent;
    let hasBoundedValueSlot = false;
    while (ancestor) {
      if (StyleSheet.flatten(ancestor.props.style)?.maxWidth === '55%') {
        hasBoundedValueSlot = true;
        break;
      }
      ancestor = ancestor.parent;
    }
    expect(hasBoundedValueSlot).toBe(true);
    expect(
      screen.UNSAFE_getAllByType(AppIcon).some(node => node.props.name === Icon.ChevronRight),
    ).toBe(true);
    expect(screen.getByRole('button', { name: `Funding, ${value}` })).toBeTruthy();
  });

  it('uses trailing content instead of the value and chevron', () => {
    const screen = render(
      <FormRow
        icon={Icon.Wallet}
        title="Auto-post"
        value="On"
        trailing={<AppToggle value onValueChange={() => {}} />}
      />,
    );
    expect(screen.queryByText('On')).toBeNull();
    expect(screen.getByRole('switch')).toBeTruthy();
    expect(screen.queryByTestId('form-row-chevron')).toBeNull();
  });

  it('keeps a trailing toggle independently reachable from row activation', () => {
    const onPress = jest.fn();
    const onValueChange = jest.fn();
    const screen = render(
      <FormRow
        icon={Icon.Wallet}
        title="Auto-post"
        onPress={onPress}
        trailing={<AppToggle value onValueChange={onValueChange} />}
      />,
    );
    const rowButton = screen.getByRole('button', { name: 'Auto-post' });
    const toggle = screen.getByRole('switch');

    expect(rowButton.findAll(node => node === toggle)).toHaveLength(0);
    fireEvent(toggle, 'valueChange', false);
    expect(onValueChange).toHaveBeenCalledWith(false);
    expect(onPress).not.toHaveBeenCalled();
  });

  it('includes the value in the default row accessibility label', () => {
    const screen = render(
      <FormRow icon={Icon.Bank} title="From" value="Salary" onPress={() => {}} />,
    );
    expect(screen.getByRole('button', { name: 'From, Salary' })).toBeTruthy();
  });

  it('renders long subtitles without forcing a single line', () => {
    const screen = render(
      <FormRow
        icon={Icon.Bank}
        title="Funding"
        subtitle="This longer explanation wraps across lines when the available width is narrow."
      />,
    );
    const subtitle = screen.getByText(
      'This longer explanation wraps across lines when the available width is narrow.',
    );
    expect(subtitle.props.numberOfLines).toBeUndefined();
  });
});
