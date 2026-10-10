import { ListGroup } from '@/src/components/core/ListGroup';
import { ListRow } from '@/src/components/core/ListRow';
import { fireEvent, render, screen } from '@/src/utils/test-utils';
import { Icon } from '@/src/types/domainIcons';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { Spacing } from '@/src/constants/design-tokens';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

describe('ListRow', () => {
  it('uses minimum leading width so custom leading content is not clipped', () => {
    render(
      <ListRow
        title="Checking"
        leadingWidth={48}
        leading={<View testID="wide-leading" style={{ width: 48 }} />}
      />,
    );

    const leadingSlot = screen
      .UNSAFE_getAllByType(View)
      .find(node => StyleSheet.flatten(node.props.style)?.minWidth === 48);

    expect(leadingSlot).toBeTruthy();
  });

  it('places the inset separator below the horizontal row content', () => {
    const screen = render(
      <ListRow title="Ends" leading={<View style={{ width: 24 }} />} showSeparator />,
    );

    const separator = screen.UNSAFE_getAllByType(View).find(node => {
      const style = StyleSheet.flatten(node.props.style);
      return style?.height === 1 && style?.backgroundColor;
    });

    expect(separator).toBeTruthy();
    expect(StyleSheet.flatten(separator?.parent?.props.style)?.flexDirection).not.toBe('row');
    expect(StyleSheet.flatten(separator?.props.style)?.marginLeft).toBeGreaterThan(0);
  });

  it('preserves horizontal layout, padding, and style for an ordinary pressable row', () => {
    const screen = render(
      <ListRow
        title="Checking"
        leading={<View style={{ width: 24 }} />}
        trailing={<View testID="passive-value" />}
        onPress={() => {}}
        style={{ width: '100%' }}
      />,
    );

    const rowLayout = screen.UNSAFE_getAllByType(View).find(node => {
      const style = StyleSheet.flatten(node.props.style);
      return (
        style?.flexDirection === 'row' &&
        style?.paddingHorizontal === Spacing.lg &&
        style?.paddingVertical === Spacing.sm
      );
    });
    const touchable = screen.UNSAFE_getByType(PressScaleTouchable);

    expect(rowLayout).toBeTruthy();
    expect(touchable.props.style).toEqual({ width: '100%' });
    expect(screen.getByTestId('passive-value')).toBeTruthy();
  });
});

describe('ListRow options', () => {
  it('makes the whole row a labelled switch for ListRow.Toggle', () => {
    const onValueChange = jest.fn();
    render(
      <ListRow
        title="Hide balances"
        subtitle="Mask amounts"
        testID="privacy-toggle"
        trailing={<ListRow.Toggle value={false} onValueChange={onValueChange} />}
      />,
    );
    const row = screen.getByRole('switch', { name: 'Hide balances, Mask amounts' });
    expect(row.props.accessibilityState).toMatchObject({ checked: false });
    expect(screen.getAllByRole('switch')).toHaveLength(1);
    fireEvent.press(screen.getByTestId('privacy-toggle'));
    expect(onValueChange).toHaveBeenCalledWith(true);
  });

  it('calls onPress without the native event', () => {
    const onPress = jest.fn();
    render(<ListRow title="Appearance" onPress={onPress} />);
    fireEvent.press(screen.getByRole('button'), { nativeEvent: { target: 42 } });
    expect(onPress).toHaveBeenCalledWith();
  });

  it('includes a ListRow.Value in the label and shows a spinner', () => {
    const { rerender } = render(
      <ListRow title="Currency" onPress={() => {}} trailing={<ListRow.Value>INR</ListRow.Value>} />,
    );
    expect(screen.getByRole('button', { name: 'Currency, INR' })).toBeTruthy();
    rerender(<ListRow title="Export" trailing={<ListRow.Spinner />} />);
    expect(screen.UNSAFE_getByType(ActivityIndicator)).toBeTruthy();
  });

  it('colors destructive rows red and announces them', () => {
    render(
      <>
        <ListRow title="Factory reset" destructive icon={Icon.Alert} onPress={() => {}} />
        <ListRow title="Cleanup" icon={Icon.Delete} />
      </>,
    );
    const color = (text: string) => StyleSheet.flatten(screen.getByText(text).props.style).color;
    expect(color('Factory reset')).not.toBe(color('Cleanup'));
    expect(screen.getByRole('button', { name: 'Factory reset' }).props.accessibilityHint).toBe(
      'Destructive action',
    );
  });

  it('adds chevrons to pressable rows in plain groups only', () => {
    render(
      <>
        <ListGroup variant="plain">
          <ListRow title="Profile" onPress={() => {}} />
          <ListRow title="Static" />
        </ListGroup>
        <ListRow title="Card row" onPress={() => {}} />
      </>,
    );
    expect(screen.UNSAFE_getAllByProps({ name: Icon.ChevronRight })).toHaveLength(1);
  });

  it('renders children under the row', () => {
    render(
      <ListRow title="Mode">
        <View testID="row-control" />
      </ListRow>,
    );
    expect(screen.getByTestId('row-control')).toBeTruthy();
  });
});
