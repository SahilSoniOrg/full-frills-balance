import { OpenItemAmount } from '@/src/components/shared/OpenItemAmount';
import { SelectionIndicator } from '@/src/components/shared/SelectionIndicator';
import { toMinorUnits } from '@/src/domain/money/money';
import {
  AppCard,
  AppSegmentedControl,
  AppText,
  Badge,
  FilterChipButton,
  PressScaleTouchable,
} from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { Inline, Stack } from '@/src/design-system';
import type { OpenItemId } from '@/src/types/ids';
import type { TransferOpenItem } from '@/src/features/journal/entry/hooks/useTransferOpenItems';
import type { RepaymentAllocationMode } from '@/src/features/journal/entry/transferOpenItemPlan';
import { StyleSheet } from 'react-native';

type Props = {
  items: readonly TransferOpenItem[];
  totalOpenRemainder: number;
  currencyCode: string;
  precision?: number;
  quickFillChips: readonly { id: string; label: string; amount: number }[];
  allocationMode: RepaymentAllocationMode;
  onAllocationModeChange: (mode: RepaymentAllocationMode) => void;
  selectedItemIds: Record<string, boolean>;
  onSelectOnlyItem?: (itemId: string) => void;
  onToggleItem: (id: OpenItemId) => void;
  onQuickFillAmount: (amount: string) => void;
  activeAmount?: number;
};
export function TransferOpenItemsCard({
  items,
  totalOpenRemainder,
  currencyCode,
  precision = 2,
  quickFillChips,
  allocationMode,
  onAllocationModeChange,
  selectedItemIds,
  onSelectOnlyItem,
  onToggleItem,
  onQuickFillAmount,
  activeAmount,
}: Props) {
  const isPrivacyMode = useEffectivePrivacyMode();
  const { theme } = useTheme();
  const pickSelected = allocationMode === 'pick' && Object.values(selectedItemIds).some(Boolean);

  return (
    <AppCard variant="outline" padding="md" radius="xl" style={styles.card}>
      <Stack gap="sm">
        <Inline justifyContent="space-between" alignItems="center" gap="sm">
          <AppText variant="caption" weight="bold" color="tertiary" style={styles.headerLabel}>
            OPEN ITEMS TO SETTLE
          </AppText>
          <Badge size="sm" variant="primary">
            {formatMoneyAmount(totalOpenRemainder, currencyCode, isPrivacyMode)}
          </Badge>
        </Inline>
        {quickFillChips.length > 0 ? (
          <Inline gap="xs" flexWrap="wrap">
            {quickFillChips.map(chip => {
              const isChipSelected =
                typeof activeAmount === 'number' &&
                Number.isFinite(activeAmount) &&
                toMinorUnits(activeAmount, precision) === toMinorUnits(chip.amount, precision);
              const handleChipPress = () => {
                onQuickFillAmount(String(chip.amount));
                if (chip.id === 'full' || chip.id === 'half') return;
                if (onSelectOnlyItem) {
                  onSelectOnlyItem(chip.id);
                  return;
                }
                if (allocationMode !== 'pick') onAllocationModeChange('pick');
                for (const item of items) {
                  if (Boolean(selectedItemIds[item.item.id]) !== (item.item.id === chip.id)) {
                    onToggleItem(item.item.id);
                  }
                }
              };
              return (
                <FilterChipButton
                  key={chip.id}
                  label={`${chip.label}: ${formatMoneyAmount(chip.amount, currencyCode, isPrivacyMode)}`}
                  isActive={isChipSelected}
                  onPress={handleChipPress}
                  testID={`transfer-quick-fill-${chip.id}`}
                />
              );
            })}
          </Inline>
        ) : null}
        <AppSegmentedControl
          flex
          testID="transfer-allocation-mode"
          options={[
            { id: 'fifo', label: 'Auto FIFO' },
            { id: 'pick', label: 'Pick items' },
          ]}
          value={allocationMode}
          onChange={onAllocationModeChange}
        />
        {allocationMode === 'pick' && !pickSelected ? (
          <AppText variant="caption" color="secondary">
            Pick at least one open item to allocate this payment, or switch to Auto FIFO.
          </AppText>
        ) : null}
        <Stack gap="xs">
          {items.map(openItem => {
            const isSelected = Boolean(selectedItemIds[openItem.item.id]);
            return (
              <PressScaleTouchable
                key={openItem.item.id}
                onPress={() => onToggleItem(openItem.item.id)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                surfaceStyle={[
                  styles.itemRowSurface,
                  {
                    backgroundColor: isSelected
                      ? withOpacity(theme.primary, Opacity.hover)
                      : theme.surfaceSecondary,
                    borderColor: isSelected
                      ? theme.primary
                      : withOpacity(theme.border, Opacity.active),
                  },
                ]}
              >
                <Inline justifyContent="space-between" alignItems="center" gap="sm">
                  <OpenItemAmount
                    originalAmount={openItem.item.originalAmount}
                    remainder={openItem.remainder}
                    currencyCode={openItem.item.currencyCode}
                    isPrivacyMode={isPrivacyMode}
                  />
                  <SelectionIndicator selected={isSelected} />
                </Inline>
              </PressScaleTouchable>
            );
          })}
        </Stack>
      </Stack>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: Spacing.lg,
    marginTop: Spacing.sm,
  },
  headerLabel: {
    letterSpacing: Typography.letterSpacing.wide,
  },

  itemRowSurface: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: Size.touchTarget,
    borderRadius: Shape.radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
  },
});
