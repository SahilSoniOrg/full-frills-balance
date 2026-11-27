import {
  AppCard,
  AppSegmentedControl,
  AppText,
  AppIcon,
  Badge,
  Icon,
  ListRow,
  PressScaleTouchable,
} from '@/src/components/core';
import { Opacity, Shape, Spacing } from '@/src/constants/design-tokens';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { withOpacity } from '@/src/design-system/colorMath';
import { useTheme } from '@/src/hooks/use-theme';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { Inline, Stack } from '@/src/design-system';
import type { OpenItemId } from '@/src/types/ids';
import { StyleSheet, View } from 'react-native';

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
            {p.quickFillChips.map(c => (
              <PressScaleTouchable
                key={c.id}
                onPress={() => p.onQuickFillAmount(String(c.amount))}
                accessibilityRole="button"
                surfaceStyle={[
                  styles.quickChip,
                  {
                    backgroundColor: withOpacity(theme.primary, Opacity.hover),
                    borderColor: withOpacity(theme.primary, Opacity.medium),
                  },
                ]}
              >
                <AppText variant="caption" weight="semibold" color="primary">
                  {c.label}: {formatMoneyAmount(c.amount, p.currencyCode, isPrivacyMode)}
                </AppText>
              </PressScaleTouchable>
            ))}
          </Inline>
        ) : null}
        <AppSegmentedControl
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
                <View style={styles.itemRowInner}>
                  <ListRow
                    title={`Original ${formatMoneyAmount(x.item.originalAmount, x.item.currencyCode, isPrivacyMode)} · ${formatMoneyAmount(x.remainder, x.item.currencyCode, isPrivacyMode)} left`}
                    background="transparent"
                    trailing={
                      <AppIcon
                        name={isSelected ? Icon.CheckCircle : Icon.Circle}
                        size={18}
                        color={isSelected ? theme.primary : theme.textTertiary}
                      />
                    }
                  />
                </View>
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
    letterSpacing: 0.6,
  },
  quickChip: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    borderRadius: Shape.radius.full,
    borderWidth: 1,
  },
  itemRowSurface: {
    borderRadius: Shape.radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  itemRowInner: {
    width: '100%',
  },
});
