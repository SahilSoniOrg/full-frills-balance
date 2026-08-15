import { AppText, IconButton, type IconName } from '@/src/components/core';
import type { IconButtonProps } from '@/src/components/core/IconButton';
import { Shape, Size, Spacing, withOpacity, Opacity } from '@/src/constants';
import { Inline, Inset, Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AnimatePresence, MotiView } from 'moti';
import { useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
}: SelectionActionBarProps) => {
  const { theme, themeMode } = useTheme();
  const insets = useSafeAreaInsets();

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
          from={{ opacity: 0, scale: Opacity.subtle, translateY: 20 }}
          animate={{ opacity: 1, scale: 1, translateY: 0 }}
          exit={{ opacity: 0, scale: Opacity.subtle, translateY: 20 }}
          transition={{ type: 'timing', duration: 180 }}
          style={[styles.wrapper, { bottom: insets.bottom + Spacing.xl * 1.5 }]}
        >
          <View
            style={[
              styles.container,
              {
                backgroundColor: theme.pure,
                borderColor: withOpacity(theme.border, Opacity.soft),
                opacity: themeMode === 'dark' ? Opacity.subtle : Opacity.solid,
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
    borderWidth: 1,
    width: '100%',
    maxWidth: 420,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
      },
      android: {
        elevation: 16,
      },
    }),
  },
});
