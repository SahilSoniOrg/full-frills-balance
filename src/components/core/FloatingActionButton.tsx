import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { Shape, Size, Spacing, ZIndex } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { triggerHaptic } from '@/src/utils/haptics';
import { StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FABProps {
  onPress: () => void;
  style?: ViewStyle;
  label?: string;
  icon?: IconName;
  placement?: 'end' | 'center';
  accessibilityLabel?: string;
  bottomOffset?: number;
}

export const FloatingActionButton = ({
  onPress,
  style,
  label,
  icon = Icon.Add,
  placement = 'end',
  accessibilityLabel,
  bottomOffset,
}: FABProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isExtended = Boolean(label);
  const safeBottomOffset = Math.max(Spacing.xl, insets.bottom + Spacing.md);

  return (
    <PressScaleTouchable
      style={[
        styles.base,
        placement === 'center' ? styles.centerPlacement : styles.endPlacement,
        { bottom: bottomOffset ?? safeBottomOffset },
        style,
      ]}
      surfaceStyle={[
        styles.surface,
        isExtended ? styles.extended : styles.fab,
        { backgroundColor: theme.primary },
      ]}
      onPress={() => {
        void triggerHaptic('light');
        onPress();
      }}
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
    </PressScaleTouchable>
  );
};

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    zIndex: ZIndex.fab,
  },
  endPlacement: {
    right: Spacing.xl,
  },
  centerPlacement: {
    alignSelf: 'center',
  },
  surface: {
    alignItems: 'center',
    justifyContent: 'center',
    ...(Shape.elevation.lg as ViewStyle),
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
