import { AppIcon, type IconName } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { Opacity, Shape, Size, Spacing, ZIndex } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';

interface FABProps {
  onPress: () => void;
  style?: ViewStyle;
  label?: string;
  icon?: IconName;
  placement?: 'end' | 'center';
  accessibilityLabel?: string;
}

export const FloatingActionButton = ({
  onPress,
  style,
  label,
  icon = 'add',
  placement = 'end',
  accessibilityLabel,
}: FABProps) => {
  const { theme } = useTheme();
  const isExtended = Boolean(label);

  return (
    <TouchableOpacity
      style={[
        styles.base,
        placement === 'center' ? styles.centerPlacement : styles.endPlacement,
        isExtended ? styles.extended : styles.fab,
        {
          backgroundColor: theme.primary,
        },
        style,
      ]}
      onPress={onPress}
      activeOpacity={Opacity.heavy}
      testID="fab-button"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label ?? 'Create new item'}
    >
      <AppIcon name={icon} size={Size.iconSm} color={theme.onPrimary} />
      {label ? (
        <AppText
          variant="body"
          weight="semibold"
          style={[styles.label, { color: theme.onPrimary }]}
        >
          {label}
        </AppText>
      ) : null}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    bottom: Spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Shape.elevation.lg as any),
    zIndex: ZIndex.fab,
  },
  endPlacement: {
    right: Spacing.xl,
  },
  centerPlacement: {
    alignSelf: 'center',
  },
  fab: {
    width: Size.fab,
    height: Size.fab,
    borderRadius: Shape.radius.full,
  },
  extended: {
    minHeight: Size.buttonLg,
    paddingHorizontal: Spacing.xl,
    borderRadius: Shape.radius.full,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  label: {
    includeFontPadding: false,
  },
});
