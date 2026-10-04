import { ListRow } from '@/src/components/core/ListRow';
import { render, screen } from '@/src/utils/test-utils';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { Spacing } from '@/src/constants/design-tokens';
import { StyleSheet, View } from 'react-native';

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
