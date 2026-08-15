import { AppText, IconButton, type IconName } from '@/src/components/core';
import type { IconButtonProps } from '@/src/components/core/IconButton';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { Box, Inline, Inset } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AnimatePresence, MotiView } from 'moti';
import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

export interface SelectionAction {
  name: IconName;
  onPress: () => void;
  variant?: IconButtonProps['variant'];
  iconColor?: string;
  disabled?: boolean;
  accessibilityLabel?: string;
  testID?: string;
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
 * No words. Only signal.
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

  const finalActions = useMemo(() => {
    if (actions) return actions;
    if (onShare) {
      return [
        {
          name: 'share' as IconName,
          onPress: onShare,
          variant: 'primary' as const,
          disabled: selectedCount === 0,
          accessibilityLabel: 'Share selected items',
        },
      ];
    }
    return [];
  }, [actions, onShare, selectedCount]);

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

  const handleSelectToggle = () => {
    if (selectionState === 'all') {
      onDeselectAll();
    } else {
      onSelectAll();
    }
  };

  return (
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
                    onPress={onClear}
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

                  {finalActions.map((action, index) => (
                    <IconButton
                      key={`${action.name}-${index}`}
                      name={action.name}
                      variant={action.variant ?? 'primary'}
                      size={Size.iconSm}
                      iconColor={action.iconColor}
                      onPress={action.onPress}
                      disabled={action.disabled ?? selectedCount === 0}
                      accessibilityLabel={action.accessibilityLabel}
                      testID={action.testID}
                    />
                  ))}
                </Inline>
              </Inline>
            </Inset>
          </View>
        </MotiView>
      )}
    </AnimatePresence>
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
});
