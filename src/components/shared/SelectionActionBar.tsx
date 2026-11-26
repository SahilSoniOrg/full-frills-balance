import { ModalSurface } from '@/src/components/overlays/ModalSurface';
import { useAfterDismiss } from '@/src/components/overlays/useAfterDismiss';
import {
  Icon,
  AppIcon,
  AppText,
  type IconName,
  ListGroup,
  PressScaleTouchable,
} from '@/src/components/core';
import type { IconButtonProps } from '@/src/components/core/IconButton';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { Box, Inline } from '@/src/design-system';
import { useReducedMotion } from '@/src/hooks/use-reduced-motion';
import { MotiView } from 'moti';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SelectionEdgeShadow, useSelectionBarSurface } from './selectionBarChrome';

export interface SelectionAction {
  name: IconName;
  label: string;
  /** Compact label for the bottom dock when `label` is longer (e.g. sheet title). */
  shortLabel?: string;
  /** Brief reason shown in the overflow sheet when the action is disabled. */
  disabledHint?: string;
  onPress: () => void;
  variant?: IconButtonProps['variant'];
  iconColor?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  isPrimary?: boolean;
}

export interface SelectionActionPartition {
  barActions: SelectionAction[];
  overflowActions: SelectionAction[];
}

export function partitionSelectionActions(actions: SelectionAction[]): SelectionActionPartition {
  // Availability changes paint and interaction, never an action's position.
  if (actions.length <= 3) {
    return { barActions: actions, overflowActions: [] };
  }

  const primaries = actions.filter(action => action.isPrimary);
  const secondaries = actions.filter(action => !action.isPrimary);
  if (primaries.length > 0) {
    return {
      barActions: primaries.slice(0, 3),
      overflowActions: [...secondaries, ...primaries.slice(3)],
    };
  }

  return {
    barActions: actions.slice(0, 3),
    overflowActions: actions.slice(3),
  };
}

export interface SelectionActionBarProps {
  selectedCount: number;
  onShare?: () => void;
  actions?: SelectionAction[];
}

/**
 * SelectionActionBar — labeled bulk-action dock while Selection mode is active.
 * Shows primary actions directly, with an overflow bottom sheet for secondary actions.
 */
export const SelectionActionBar = ({
  selectedCount,
  onShare,
  actions,
}: SelectionActionBarProps) => {
  const { cardStyle, theme } = useSelectionBarSurface('bottom');
  const reduceMotion = useReducedMotion();
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const afterDismiss = useAfterDismiss();
  const isBarActive = selectedCount > 0;
  const isModalVisible = isOverflowOpen && isBarActive;
  const copy = AppConfig.strings.selection;

  const finalActions: SelectionAction[] = useMemo(() => {
    if (actions) return actions;
    if (onShare) {
      return [
        {
          name: Icon.Share,
          label: 'Share',
          onPress: onShare,
          variant: 'primary',
          isPrimary: true,
          disabled: selectedCount === 0,
          accessibilityLabel: copy.shareSelected,
        },
      ];
    }
    return [];
  }, [actions, onShare, selectedCount, copy.shareSelected]);

  // Split actions between direct bar buttons and overflow bottom sheet
  const { barActions, overflowActions } = useMemo(
    () => partitionSelectionActions(finalActions),
    [finalActions],
  );

  useEffect(() => {
    if (!isBarActive) {
      afterDismiss.cancel();
      // Reset overflow state when selection clears so re-selecting starts closed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsOverflowOpen(false);
    }
  }, [afterDismiss, isBarActive]);

  const resolveDockTone = (action: SelectionAction, disabled: boolean) => {
    if (disabled) return theme.textTertiary;
    if (action.variant === 'error') return theme.error;
    if (action.iconColor) return action.iconColor;
    if (action.variant === 'primary') return theme.primary;
    return theme.text;
  };

  return (
    <>
      {finalActions.length > 0 && (
        <MotiView
          pointerEvents="box-none"
          from={{
            opacity: 0,
            scale: reduceMotion ? 1 : 0.96,
            translateY: reduceMotion ? 0 : 18,
          }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          transition={{
            type: 'timing',
            duration: 180,
          }}
          style={styles.bottomWrapper}
        >
          <SelectionEdgeShadow edge="bottom" />
          <View style={[styles.actionsCard, cardStyle]}>
            <Inline align="stretch" justify="space-between" style={styles.dockRow}>
              {barActions.map((action, index) => {
                const disabled = selectedCount === 0 || !!action.disabled;
                const tone = resolveDockTone(action, disabled);
                return (
                  <PressScaleTouchable
                    key={`${action.name}-${index}`}
                    onPress={action.onPress}
                    disabled={disabled}
                    pressScale="subtle"
                    haptic={action.variant === 'error' ? 'destructive' : 'selection'}
                    accessibilityRole="button"
                    accessibilityLabel={action.accessibilityLabel || action.label}
                    accessibilityState={{ disabled }}
                    testID={action.testID}
                    style={styles.dockItem}
                    surfaceStyle={[styles.dockSurface, disabled && styles.dockDisabled]}
                  >
                    <AppIcon name={action.name} size={Size.iconSm} color={tone} />
                    <AppText
                      variant="caption"
                      weight="medium"
                      numberOfLines={1}
                      style={[styles.dockLabel, { color: tone }]}
                    >
                      {action.shortLabel ?? action.label}
                    </AppText>
                  </PressScaleTouchable>
                );
              })}

              {overflowActions.length > 0 && (
                <PressScaleTouchable
                  onPress={() => setIsOverflowOpen(true)}
                  disabled={selectedCount === 0}
                  pressScale="subtle"
                  haptic="selection"
                  accessibilityRole="button"
                  accessibilityLabel={copy.moreActions}
                  accessibilityState={{ disabled: selectedCount === 0 }}
                  style={styles.dockItem}
                  surfaceStyle={[styles.dockSurface, selectedCount === 0 && styles.dockDisabled]}
                >
                  <AppIcon
                    name={Icon.More}
                    size={Size.iconSm}
                    color={selectedCount === 0 ? theme.textTertiary : theme.textSecondary}
                  />
                  <AppText
                    variant="caption"
                    weight="medium"
                    numberOfLines={1}
                    style={[
                      styles.dockLabel,
                      { color: selectedCount === 0 ? theme.textTertiary : theme.textSecondary },
                    ]}
                  >
                    {copy.more}
                  </AppText>
                </PressScaleTouchable>
              )}
            </Inline>
          </View>
        </MotiView>
      )}

      {overflowActions.length > 0 && (
        <ModalSurface
          visible={isModalVisible}
          title={copy.actionsSheetTitle(selectedCount)}
          onClose={() => {
            afterDismiss.cancel();
            setIsOverflowOpen(false);
          }}
          onDismiss={afterDismiss.onDismiss}
          position="bottomSheet"
          fixedHeight={false}
          scrollable={false}
        >
          <Box paddingBottom="lg">
            <ListGroup
              items={overflowActions}
              toRow={(action, index) => {
                const destructive = action.variant === 'error';
                const disabled = selectedCount === 0 || !!action.disabled;
                const iconColor =
                  !disabled && !destructive
                    ? (action.iconColor ??
                      (action.variant === 'primary' ? theme.primary : undefined))
                    : undefined;

                return {
                  id: `${action.name}-${index}`,
                  title: action.label || action.accessibilityLabel || action.name,
                  subtitle: disabled ? action.disabledHint : undefined,
                  icon: iconColor ? undefined : action.name,
                  leading: iconColor ? (
                    <AppIcon name={action.name} size={Size.iconMd} color={iconColor} />
                  ) : undefined,
                  onPress: () => {
                    afterDismiss.run(action.onPress);
                    setIsOverflowOpen(false);
                  },
                  destructive,
                  disabled,
                  accessibilityLabel: action.accessibilityLabel || action.label,
                  testID: action.testID,
                };
              }}
            />
          </Box>
        </ModalSurface>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  bottomWrapper: {
    width: '100%',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.xs,
    paddingBottom: Spacing.xs,
    alignItems: 'center',
  },
  actionsCard: {
    borderRadius: Shape.radius.xl,
    borderWidth: 1,
    width: '100%',
    maxWidth: 440,
  },
  dockRow: {
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
  },
  dockItem: {
    flex: 1,
    minWidth: 0,
  },
  dockSurface: {
    minHeight: Size.touchTarget + Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.md,
  },
  dockDisabled: {
    opacity: Opacity.medium,
  },
  dockLabel: {
    textAlign: 'center',
  },
});
