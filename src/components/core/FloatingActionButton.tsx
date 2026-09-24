import { AppIcon } from '@/src/components/core/AppIcon';
import { AppText } from '@/src/components/core/AppText';
import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { Shape, Size, Spacing, ZIndex } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { Icon, type IconName } from '@/src/types/domainIcons';
import { triggerHaptic } from '@/src/utils/haptics';
import { useState } from 'react';
import { Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface FloatingActionButtonAction {
  id: string;
  label: string;
  icon?: IconName;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}

export type FloatingActionButtonBehavior =
  | {
      onPress: () => void;
      actions?: undefined;
      onExpand?: undefined;
      closeAccessibilityLabel?: undefined;
    }
  | {
      actions: readonly FloatingActionButtonAction[];
      /** Fires when the action menu opens. */
      onExpand?: () => void;
      closeAccessibilityLabel: string;
      onPress?: undefined;
    };

export type FloatingActionButtonProps = FloatingActionButtonBehavior & {
  style?: ViewStyle;
  label?: string;
  icon?: IconName;
  placement?: 'end' | 'center';
  accessibilityLabel?: string;
  bottomOffset?: number;
};

export const FloatingActionButton = ({
  onPress,
  onExpand,
  closeAccessibilityLabel,
  style,
  label,
  icon = Icon.Add,
  placement = 'end',
  accessibilityLabel,
  bottomOffset,
  actions = [],
}: FloatingActionButtonProps) => {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const isExtended = Boolean(label);
  const safeBottomOffset = Math.max(Spacing.xl, insets.bottom + Spacing.md);
  const [isExpanded, setIsExpanded] = useState(false);
  const hasActions = actions.length > 0;

  const handlePress = () => {
    void triggerHaptic('light');
    if (hasActions) {
      if (!isExpanded) onExpand?.();
      setIsExpanded(!isExpanded);
      return;
    }
    onPress?.();
  };

  return (
    <>
      {isExpanded && hasActions ? (
        <Pressable
          style={styles.dismissOverlay}
          onPress={() => setIsExpanded(false)}
          testID="fab-dismiss-overlay"
          accessible={false}
        />
      ) : null}

      <View
        style={[
          styles.base,
          placement === 'center' ? styles.centerPlacement : styles.endPlacement,
          { bottom: bottomOffset ?? safeBottomOffset },
          style,
        ]}
      >
        {isExpanded && hasActions ? (
          <View
            style={[styles.actionList, placement === 'center' && styles.centerActionList]}
            accessibilityRole="menu"
          >
            {actions.map(action => (
              <PressScaleTouchable
                key={action.id}
                onPress={() => {
                  void triggerHaptic('light');
                  setIsExpanded(false);
                  action.onPress();
                }}
                surfaceStyle={[styles.surface, styles.action, { backgroundColor: theme.primary }]}
                testID={action.testID}
                accessibilityRole="menuitem"
                accessibilityLabel={action.accessibilityLabel ?? action.label}
              >
                <AppIcon
                  name={action.icon ?? Icon.Transaction}
                  size={Size.iconSm}
                  color={theme.onPrimary}
                />
                <AppText
                  variant="body"
                  weight="semibold"
                  style={[styles.label, { color: theme.onPrimary }]}
                >
                  {action.label}
                </AppText>
              </PressScaleTouchable>
            ))}
          </View>
        ) : null}

        <PressScaleTouchable
          style={styles.trigger}
          surfaceStyle={[
            styles.surface,
            hasActions && isExpanded ? styles.close : isExtended ? styles.extended : styles.fab,
            { backgroundColor: theme.primary },
          ]}
          onPress={handlePress}
          testID="fab-button"
          accessibilityRole="button"
          accessibilityLabel={
            hasActions && isExpanded
              ? closeAccessibilityLabel
              : (accessibilityLabel ?? label ?? 'Create new item')
          }
          accessibilityState={{ expanded: hasActions ? isExpanded : undefined }}
        >
          <AppIcon
            name={hasActions && isExpanded ? Icon.Close : icon}
            size={Size.iconSm}
            color={theme.onPrimary}
          />
          {!((hasActions && isExpanded) || !label) ? (
            <AppText
              variant="body"
              weight="semibold"
              style={[styles.label, { color: theme.onPrimary }]}
            >
              {label}
            </AppText>
          ) : null}
        </PressScaleTouchable>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  base: {
    position: 'absolute',
    zIndex: ZIndex.fab,
  },
  dismissOverlay: {
    ...StyleSheet.absoluteFill,
    zIndex: ZIndex.fab - 1,
  },
  trigger: {
    alignSelf: 'flex-end',
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
    // Keep the depth visible on iOS as well as Android.
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
    ...(Shape.elevation.lg as ViewStyle),
  },
  fab: {
    width: Size.fab,
    height: Size.fab,
    borderRadius: Shape.radius.full,
  },
  close: {
    width: Size.buttonMd,
    height: Size.buttonMd,
    borderRadius: Shape.radius.full,
  },
  extended: {
    minHeight: Size.buttonLg,
    paddingHorizontal: Spacing.xl,
    borderRadius: Shape.radius.full,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  actionList: {
    alignItems: 'flex-end',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  centerActionList: {
    alignItems: 'center',
  },
  action: {
    minHeight: Size.buttonLg,
    paddingHorizontal: Spacing.lg,
    borderRadius: Shape.radius.full,
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  label: {
    includeFontPadding: false,
  },
});
