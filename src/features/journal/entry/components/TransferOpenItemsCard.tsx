import {
  AppCard,
  AppSegmentedControl,
  AppText,
  AppIcon,
  Badge,
  Icon,
  PressScaleTouchable,
} from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { Inline, Stack } from '@/src/design-system';
import type { OpenItemId } from '@/src/types/ids';
import { StyleSheet } from 'react-native';

type Item = {
  item: { id: OpenItemId; originalAmount: number; currencyCode: string };
  remainder: number;
};
type Props = {
  items: Item[];
  totalOpenRemainder: number;
  currencyCode: string;
  quickFillChips: { id: string; label: string; amount: number }[];
  allocationMode: 'fifo' | 'pick';
  onAllocationModeChange: (mode: 'fifo' | 'pick') => void;
  selectedItemIds: Record<string, boolean>;
  onToggleItem: (id: OpenItemId) => void;
  onQuickFillAmount: (amount: string) => void;
  activeAmount?: number;
};
export function TransferOpenItemsCard(p: Props) {
  const isPrivacyMode = useEffectivePrivacyMode();
  const { theme } = useTheme();
  return (
    <AppCard variant="outline" padding="md" radius="xl" style={styles.card}>
      <Stack gap="sm">
        <Inline justifyContent="space-between" alignItems="center" gap="sm">
          <AppText variant="caption" weight="bold" color="tertiary" style={styles.headerLabel}>
            OPEN ITEMS TO SETTLE
          </AppText>
          <Badge size="sm" variant="primary">
            {formatMoneyAmount(p.totalOpenRemainder, p.currencyCode, isPrivacyMode)}
          </Badge>
        </Inline>
        {p.quickFillChips.length > 0 ? (
          <Inline gap="xs" flexWrap="wrap">
            {p.quickFillChips.map(c => {
              const isChipSelected =
                typeof p.activeAmount === 'number' &&
                Number.isFinite(p.activeAmount) &&
                Math.abs(p.activeAmount - c.amount) < 0.005;
              const handleChipPress = () => {
                p.onQuickFillAmount(String(c.amount));
                if (c.id !== 'full' && c.id !== 'half') {
                  if (p.allocationMode !== 'pick') p.onAllocationModeChange('pick');
                  for (const item of p.items) {
                    if (Boolean(p.selectedItemIds[item.item.id]) !== (item.item.id === c.id)) {
                      p.onToggleItem(item.item.id);
                    }
                  }
                }
              };
              return (
                <PressScaleTouchable
                  key={c.id}
                  onPress={handleChipPress}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isChipSelected }}
                  surfaceStyle={[
                    styles.quickChip,
                    {
                      backgroundColor: isChipSelected
                        ? withOpacity(theme.primary, Opacity.soft)
                        : withOpacity(theme.primary, Opacity.hover),
                      borderColor: isChipSelected
                        ? theme.primary
                        : withOpacity(theme.primary, Opacity.medium),
                    },
                  ]}
                >
                  <AppText variant="caption" weight="semibold" color="primary">
                    {c.label}: {formatMoneyAmount(c.amount, p.currencyCode, isPrivacyMode)}
                  </AppText>
                </PressScaleTouchable>
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
          value={p.allocationMode}
          onChange={p.onAllocationModeChange}
        />
        <Stack gap="xs">
          {p.items.map(x => {
            const isSelected = Boolean(p.selectedItemIds[x.item.id]);
            return (
              <PressScaleTouchable
                key={x.item.id}
                onPress={() => p.onToggleItem(x.item.id)}
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
                  <AppText variant="body" style={styles.itemRowText}>
                    {`Original ${formatMoneyAmount(x.item.originalAmount, x.item.currencyCode, isPrivacyMode)} · ${formatMoneyAmount(x.remainder, x.item.currencyCode, isPrivacyMode)} left`}
                  </AppText>
                  <AppIcon
                    name={isSelected ? Icon.CheckCircle : Icon.Circle}
                    size={Size.iconSm}
                    color={isSelected ? theme.primary : theme.textTertiary}
                  />
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
  quickChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
  },
  itemRowSurface: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    minHeight: Size.touchTarget,
    borderRadius: Shape.radius.lg,
    borderWidth: 1,
    justifyContent: 'center',
  },
  itemRowText: {
    flex: 1,
  },
});
