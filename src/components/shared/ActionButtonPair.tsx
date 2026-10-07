import { useWindowDimensions } from 'react-native';
import { AppButton } from '@/src/components/core';
import { Size, Spacing } from '@/src/constants';
import { Row } from '@/src/design-system';

interface PairAction {
  label: string;
  onPress?: () => void;
  loading?: boolean;
  testID?: string;
}

/** Primary action with an optional secondary one beside it; stacks full-width at large text sizes. */
export function ActionButtonPair({
  primary,
  secondary,
  disabled,
}: {
  primary: PairAction;
  secondary?: PairAction;
  disabled?: boolean;
}) {
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > 1.3;
  const button = (action: PairAction, variant: 'primary' | 'secondary', flex: number) => (
    <AppButton
      variant={variant}
      onPress={action.onPress}
      disabled={disabled}
      loading={action.loading}
      accessibilityLabel={action.label}
      testID={action.testID}
      buttonStyle={{
        flex: stacked ? undefined : flex,
        minHeight: Size.buttonMd,
        paddingVertical: Spacing.sm,
      }}
      style={stacked ? { width: '100%' } : { flex }}
    >
      {action.label}
    </AppButton>
  );
  return (
    <Row gap="sm" align="stretch" style={{ flexDirection: stacked ? 'column' : 'row' }}>
      {button(primary, 'primary', 2)}
      {secondary ? button(secondary, 'secondary', 1) : null}
    </Row>
  );
}
