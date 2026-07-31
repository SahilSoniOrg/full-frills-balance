import { AppIcon } from '@/src/components/core';
import { Opacity, Spacing, withOpacity } from '@/src/constants';
import { Box } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { memo } from 'react';
import { StyleSheet } from 'react-native';
import { TransactionCard, type TransactionCardProps } from './TransactionCard';

export type SelectableTransactionCardProps = TransactionCardProps & {
  isSelected?: boolean;
  isSelectionModeActive?: boolean;
};

const SelectionIndicator = memo(
  ({
    isSelected,
    isActive,
    color,
    border,
  }: {
    isSelected?: boolean;
    isActive?: boolean;
    color: string;
    border: string;
  }) => {
    if (!isSelected && !isActive) return null;

    return (
      <Box
        width={24}
        height={24}
        borderRadius="full"
        alignItems="center"
        justifyContent="center"
        background={isSelected ? undefined : 'transparent'}
        unsafe_backgroundRaw={isSelected ? color : undefined}
        style={[
          styles.selectionIndicator,
          {
            borderWidth: isSelected ? 0 : 2,
            borderColor: isSelected ? 'transparent' : border,
            opacity: isSelected ? Opacity.high : Opacity.medium,
          },
        ]}
      >
        {isSelected && <AppIcon name="check" size={12} color="white" />}
      </Box>
    );
  },
);
SelectionIndicator.displayName = 'SelectionIndicator';

const SelectableTransactionCardComponent = ({
  isSelected,
  isSelectionModeActive,
  ...cardProps
}: SelectableTransactionCardProps) => {
  const { theme } = useTheme();

  return (
    <TransactionCard
      {...cardProps}
      contentScale={isSelected ? 0.96 : 1}
      cardStyle={{
        borderWidth: isSelected ? 1.5 : 0,
        borderColor: isSelected ? theme.primary : 'transparent',
      }}
      overlay={
        <SelectionIndicator
          isSelected={isSelected}
          isActive={isSelectionModeActive}
          color={theme.primary}
          border={withOpacity(theme.textTertiary, Opacity.hover)}
        />
      }
    />
  );
};

export const SelectableTransactionCard = memo(SelectableTransactionCardComponent);

SelectableTransactionCard.displayName = 'SelectableTransactionCard';

const styles = StyleSheet.create({
  selectionIndicator: {
    position: 'absolute',
    right: Spacing.md,
    top: '50%',
    marginTop: -12,
    zIndex: 10,
  },
});
