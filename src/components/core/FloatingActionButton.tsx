import { AppIcon } from '@/src/components/core/AppIcon';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { AppText } from '@/src/components/core/AppText';
import { Opacity, Shape, Size, Spacing, ZIndex } from '@/src/constants';
import { usePressScale } from '@/src/hooks/usePressScale';
import { useTheme } from '@/src/hooks/use-theme';
import { triggerHaptic } from '@/src/utils/haptics';
import { MotiView } from 'moti';
import { StyleSheet, TouchableOpacity, ViewStyle } from 'react-native';
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
  const { animate, transition, handlePressIn, handlePressOut } = usePressScale();

  return (
    <TouchableOpacity
      style={[
        styles.base,
        placement === 'center' ? styles.centerPlacement : styles.endPlacement,
        {
          bottom: bottomOffset ?? safeBottomOffset,
        },
        style,
      ]}
      onPress={() => {
        void triggerHaptic('light');
        onPress();
      }}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={Opacity.heavy}
      testID="fab-button"
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label ?? 'Create new item'}
    >
      <MotiView
        animate={animate}
        transition={transition}
        style={[
          styles.surface,
          isExtended ? styles.extended : styles.fab,
          { backgroundColor: theme.primary },
        ]}
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
      </MotiView>
    </TouchableOpacity>
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
