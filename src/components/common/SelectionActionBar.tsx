import { ModalSurface } from '@/src/components/common/ModalSurface';
import { AppIcon, AppText, IconButton, type IconName } from '@/src/components/core';
import type { IconButtonProps } from '@/src/components/core/IconButton';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { Box, Inline, Inset } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AnimatePresence, MotiView } from 'moti';
import { useMemo, useState } from 'react';
import { Platform, StyleSheet, TouchableOpacity, View } from 'react-native';

export interface SelectionAction {
  name: IconName;
  label?: string;
  onPress: () => void;
  variant?: IconButtonProps['variant'];
  iconColor?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
  isPrimary?: boolean;
}

/**
 * Secondary chrome shown while a list is in selection mode — select-all,
 * clear, share, the overflow action bar, and dismiss. Bundled as a single
 * object so view-models hand the common list a single prop instead of five
 * and so feature hooks can assemble it once instead of re-deriving it per
 * consumer. Lived in `JournalEntryListView` previously; moved here because
 * it is imported across accounts/budget/dashboard/hub/journal feature hooks
 * and belongs next to `SelectionAction`, which it references.
 */
export interface ListSelectionChrome {
  exitSelectionMode: () => void;
  selectAll: () => void;
  clearItems: () => void;
  onShareSelected?: () => void;
  actions?: SelectionAction[];
}

export interface SelectionActionPartition {
  barActions: SelectionAction[];
  overflowActions: SelectionAction[];
}

export function partitionSelectionActions(actions: SelectionAction[]): SelectionActionPartition {
  const applicableActions = actions.filter(action => !action.disabled);
  if (applicableActions.length <= 3) {
    return { barActions: applicableActions, overflowActions: [] };
  }

  const primaries = applicableActions.filter(action => action.isPrimary);
  const secondaries = applicableActions.filter(action => !action.isPrimary);
  if (primaries.length > 0) {
    return {
      barActions: primaries.slice(0, 3),
      overflowActions: [...secondaries, ...primaries.slice(3)],
    };
  }

  return {
    barActions: applicableActions.slice(0, 3),
    overflowActions: applicableActions.slice(3),
  };
}

export interface SelectionActionBarProps {
  selectedCount: number;
  totalCount: number;
  onClear: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onShare?: () => void;
  actions?: SelectionAction[];
  isVisible: boolean;
  bottomOffset?: number;
}

/**
 * SelectionActionBar — bulk actions while Selection mode is active.
 * Shows primary actions directly, with an overflow bottom sheet for secondary actions.
 */
export const SelectionActionBar = ({
  selectedCount,
  totalCount,
  onClear,
  onSelectAll,
  onDeselectAll,
  onShare,
  actions,
  isVisible,
  bottomOffset,
}: SelectionActionBarProps) => {
  const { theme } = useTheme();
  const bottom = bottomOffset ?? Spacing.md;
  const [isOverflowOpen, setIsOverflowOpen] = useState(false);
  const isBarActive = isVisible && selectedCount > 0;
  const isModalVisible = isOverflowOpen && isBarActive;

  const finalActions = useMemo(() => {
    if (actions) return actions;
    if (onShare) {
      return [
        {
          name: 'share' as IconName,
          label: 'Share',
          onPress: onShare,
          variant: 'primary' as const,
          isPrimary: true,
          disabled: selectedCount === 0,
          accessibilityLabel: 'Share selected items',
        },
      ];
    }
    return [];
  }, [actions, onShare, selectedCount]);

  // Split actions between direct bar buttons and overflow bottom sheet
  const { barActions, overflowActions } = useMemo(
    () => partitionSelectionActions(finalActions),
    [finalActions],
  );

  // --- Selection State Logic
  const selectionState = useMemo(() => {
    if (selectedCount === 0) return 'none';
    if (selectedCount === totalCount && totalCount > 0) return 'all';
    return 'partial';
  }, [selectedCount, totalCount]);

  const selectIcon = useMemo(() => {
    switch (selectionState) {
      case 'all':
        return 'checkSquare';
      case 'partial':
        return 'minusSquare';
      default:
        return 'square';
    }
  }, [selectionState]);

  const handleClear = () => {
    setIsOverflowOpen(false);
    onClear();
  };

  const handleDeselectAll = () => {
    setIsOverflowOpen(false);
    onDeselectAll();
  };

  const handleSelectToggle = () => {
    if (totalCount === 0) return;
    if (selectionState === 'all') {
      handleDeselectAll();
    } else {
      onSelectAll();
    }
  };

  return (
    <>
      <AnimatePresence>
        {isVisible && (
          <MotiView
            from={{ opacity: 0, scale: 0.92, translateY: 24 }}
            animate={{ opacity: 1, scale: 1, translateY: 0 }}
            exit={{ opacity: 0, scale: 0.92, translateY: 24 }}
            transition={{
              type: 'timing',
              duration: 150,
            }}
            style={[styles.wrapper, { bottom }]}
          >
            <View
              style={[
                styles.container,
                {
                  backgroundColor: theme.pure,
                  borderColor: withOpacity(theme.primary, Opacity.muted),
                },
              ]}
            >
              <Inset horizontal="md" vertical="xs">
                <Inline align="center" justify="space-between" gap="xs">
                  {/* LEFT: Exit & Count */}
                  <Inline align="center" gap="xs">
                    <IconButton
                      name="close"
                      size={Size.iconSm}
                      onPress={handleClear}
                      variant="clear"
                      accessibilityLabel="Exit selection"
                    />

                    <Box
                      unsafe_backgroundRaw={theme.primary}
                      borderRadius="full"
                      paddingHorizontal="sm"
                      paddingVertical="xs"
                      minWidth={26}
                      alignItems="center"
                    >
                      <AppText variant="caption" weight="bold" style={{ color: theme.onPrimary }}>
                        {selectedCount}
                      </AppText>
                    </Box>
                  </Inline>

                  {/* RIGHT: Actions */}
                  <Inline align="center" gap="xs">
                    <IconButton
                      name={selectIcon}
                      onPress={handleSelectToggle}
                      variant="clear"
                      size={Size.iconSm}
                      disabled={totalCount === 0}
                      accessibilityLabel="Toggle all"
                    />

                    {barActions.map((action, index) => (
                      <IconButton
                        key={`${action.name}-${index}`}
                        name={action.name}
                        variant={action.variant ?? 'primary'}
                        size={Size.iconSm}
                        iconColor={action.iconColor}
                        onPress={action.onPress}
                        disabled={action.disabled ?? selectedCount === 0}
                        accessibilityLabel={action.accessibilityLabel || action.label}
                        testID={action.testID}
                      />
                    ))}

                    {overflowActions.length > 0 && (
                      <IconButton
                        name="more"
                        variant="surface"
                        size={Size.iconSm}
                        onPress={() => setIsOverflowOpen(true)}
                        disabled={selectedCount === 0}
                        accessibilityLabel="More bulk actions"
                      />
                    )}
                  </Inline>
                </Inline>
              </Inset>
            </View>
          </MotiView>
        )}
      </AnimatePresence>

      {overflowActions.length > 0 && (
        <ModalSurface
          visible={isModalVisible}
          title={`Actions (${selectedCount} selected)`}
          onClose={() => setIsOverflowOpen(false)}
          position="bottomSheet"
          fixedHeight={false}
          scrollable={false}
        >
          <View style={styles.sheetContent}>
            {overflowActions.map((action, index) => {
              const isDestructive = action.variant === 'error';
              const isDisabled = action.disabled ?? selectedCount === 0;
              const itemColor = isDisabled
                ? theme.textTertiary
                : isDestructive
                  ? theme.error
                  : theme.text;
              const iconColor = isDisabled
                ? theme.textTertiary
                : isDestructive
                  ? theme.error
                  : (action.iconColor ??
                    (action.variant === 'primary' ? theme.primary : theme.textSecondary));

              return (
                <TouchableOpacity
                  key={`${action.name}-${index}`}
                  onPress={() => {
                    setIsOverflowOpen(false);
                    action.onPress();
                  }}
                  disabled={isDisabled}
                  activeOpacity={Opacity.heavy}
                  style={[styles.sheetActionRow, { borderBottomColor: theme.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={action.accessibilityLabel || action.label}
                  testID={action.testID}
                >
                  <View style={styles.sheetActionLeft}>
                    <AppIcon name={action.name} size={Size.iconMd} color={iconColor} />
                    <AppText
                      variant="body"
                      weight="medium"
                      style={{ color: itemColor, marginLeft: Spacing.md }}
                    >
                      {action.label || action.accessibilityLabel || action.name}
                    </AppText>
                  </View>
                  <AppIcon
                    name="chevronRight"
                    size={Size.iconSm}
                    color={isDisabled ? theme.textTertiary : theme.textSecondary}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </ModalSurface>
      )}
    </>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: Spacing.md,
    right: Spacing.md,
    alignItems: 'center',
    zIndex: 1000,
  },
  container: {
    borderRadius: Shape.radius.full,
    borderWidth: 1.5,
    width: '100%',
    maxWidth: 420,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.35,
        shadowRadius: 16,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  sheetContent: {
    paddingBottom: Spacing.lg,
  },
  sheetActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetActionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
