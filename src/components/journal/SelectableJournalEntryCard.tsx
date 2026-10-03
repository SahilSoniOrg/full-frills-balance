import { Icon, AppIcon } from '@/src/components/core';
import { BorderWidth, Opacity, Size, Spacing } from '@/src/constants';
import { withOpacity } from '@/src/utils/color-math';
import { Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { JournalEntryCard, type JournalEntryCardProps } from './JournalEntryCard';

export type SelectableJournalEntryCardProps = JournalEntryCardProps & {
  isSelected?: boolean;
  isSelectionModeActive?: boolean;
};

const SELECTION_INDICATOR_SIZE = Size.md;
/** Selection outline sits between thin (1) and medium (2). */
const SELECTION_CARD_BORDER_WIDTH = 1.5;

const SelectionIndicator = memo(
  ({
    isSelected,
    isActive,
    color,
    checkColor,
    border,
  }: {
    isSelected?: boolean;
    isActive?: boolean;
    color: string;
    checkColor: string;
    border: string;
  }) => {
    if (!isSelected && !isActive) return null;

    return (
      <Box
        width={SELECTION_INDICATOR_SIZE}
        height={SELECTION_INDICATOR_SIZE}
        borderRadius="full"
        alignItems="center"
        justifyContent="center"
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        background={isSelected ? undefined : 'transparent'}
        unsafe_backgroundRaw={isSelected ? color : undefined}
        style={[
          styles.selectionIndicator,
          {
            borderWidth: isSelected ? 0 : BorderWidth.medium,
            borderColor: isSelected ? 'transparent' : border,
            opacity: isSelected ? Opacity.high : Opacity.medium,
          },
        ]}
      >
        {isSelected && <AppIcon name={Icon.Check} size={Size.xxs} color={checkColor} />}
      </Box>
    );
  },
);
SelectionIndicator.displayName = 'SelectionIndicator';

const SelectableJournalEntryCardComponent = ({
  isSelected,
  isSelectionModeActive,
  ...cardProps
}: SelectableJournalEntryCardProps) => {
  const { theme } = useTheme();

  return (
    <JournalEntryCard
      {...cardProps}
      isSelected={isSelected}
      cardStyle={[
        cardProps.cardStyle,
        {
          borderWidth: isSelected ? SELECTION_CARD_BORDER_WIDTH : 0,
          borderColor: isSelected ? theme.primary : 'transparent',
        },
      ]}
      overlay={
        isSelected || isSelectionModeActive ? (
          <SelectionIndicator
            isSelected={isSelected}
            isActive={isSelectionModeActive}
            color={theme.primary}
            checkColor={theme.onPrimary}
            border={withOpacity(theme.textTertiary, Opacity.hover)}
          />
        ) : undefined
      }
    />
  );
};

export const SelectableJournalEntryCard = memo(SelectableJournalEntryCardComponent);

SelectableJournalEntryCard.displayName = 'SelectableJournalEntryCard';

const styles = StyleSheet.create({
  selectionIndicator: {
    position: 'absolute',
    right: Spacing.md,
    top: Spacing.lg,
    zIndex: 10,
  },
});
