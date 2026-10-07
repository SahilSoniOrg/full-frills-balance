import { IconButton } from '@/src/components/core';
import type { IconName } from '@/src/components/core';
import type { IconButtonVariant } from '@/src/components/core/IconButton';
import { Spacing } from '@/src/constants';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

export interface ScreenHeaderActionItem {
  name: IconName;
  onPress?: () => void;
  variant?: IconButtonVariant;
  iconColor?: string;
  size?: number;
  testID?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
}

interface ScreenHeaderActionsProps {
  actions: ScreenHeaderActionItem[];
  leading?: ReactNode;
  /** Always last (rightmost). Use for PrivacyToggleButton. */
  trailing?: ReactNode;
}

export function ScreenHeaderActions({ actions, leading, trailing }: ScreenHeaderActionsProps) {
  return (
    <View style={styles.container}>
      {leading}
      {actions.map((action, index) => (
        <IconButton
          key={`${action.name}-${index}`}
          name={action.name}
          onPress={action.onPress}
          variant={action.variant ?? 'clear'}
          iconColor={action.iconColor}
          size={action.size}
          testID={action.testID}
          disabled={action.disabled}
          accessibilityLabel={action.accessibilityLabel}
        />
      ))}
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
});
