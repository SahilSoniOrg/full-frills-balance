import {
  AppCard,
  AppSegmentedControl,
  AppText,
  AppIcon,
  Icon,
  ListRow,
  PressScaleTouchable,
} from '@/src/components/core';
import { useEffectivePrivacyMode } from '@/src/contexts/PrivacyScope';
import { formatMoneyAmount } from '@/src/utils/currencyFormatter';
import { Inline, Stack } from '@/src/design-system';
import type { OpenItemId } from '@/src/types/ids';

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
  return (
    <AppCard variant="outline" padding="md" radius="xl">
      <Stack gap="sm">
        <Inline>
          <AppText variant="caption" weight="semibold" style={{ flex: 1 }}>
            OPEN ITEMS TO SETTLE
          </AppText>
          <AppText>
            {formatMoneyAmount(p.totalOpenRemainder, p.currencyCode, isPrivacyMode)}
          </AppText>
        </Inline>
        <Inline gap="xs">
          {p.quickFillChips.map(c => (
            <PressScaleTouchable key={c.id} onPress={() => p.onQuickFillAmount(String(c.amount))}>
              <AppText variant="caption">
                {c.label}: {formatMoneyAmount(c.amount, p.currencyCode, isPrivacyMode)}
              </AppText>
            </PressScaleTouchable>
          ))}
        </Inline>
        <AppSegmentedControl
          options={[
            { id: 'fifo', label: 'Auto FIFO' },
            { id: 'pick', label: 'Pick items' },
          ]}
          value={p.allocationMode}
          onChange={p.onAllocationModeChange}
        />
        {p.items.map(x => (
          <PressScaleTouchable key={x.item.id} onPress={() => p.onToggleItem(x.item.id)}>
            <ListRow
              title={`Original ${formatMoneyAmount(x.item.originalAmount, x.item.currencyCode, isPrivacyMode)} · ${formatMoneyAmount(x.remainder, x.item.currencyCode, isPrivacyMode)} left`}
              trailing={
                p.selectedItemIds[x.item.id] ? <AppIcon name={Icon.CheckCircle} /> : undefined
              }
            />
          </PressScaleTouchable>
        ))}
      </Stack>
    </AppCard>
  );
}
