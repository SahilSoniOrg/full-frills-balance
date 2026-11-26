import {
  AppCard,
  AppSegmentedControl,
  AppText,
  AppIcon,
  ListRow,
  PressScaleTouchable,
} from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
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
  return (
    <AppCard variant="outline" padding="md" radius="xl">
      <Stack gap="sm">
        <Inline>
          <AppText variant="caption" weight="semibold" style={{ flex: 1 }}>
            OPEN ITEMS TO SETTLE
          </AppText>
          <MoneyText amount={p.totalOpenRemainder} currencyCode={p.currencyCode} />
        </Inline>
        <Inline gap="xs">
          {p.quickFillChips.map(c => (
            <PressScaleTouchable key={c.id} onPress={() => p.onQuickFillAmount(String(c.amount))}>
              <AppText variant="caption">{c.label}</AppText>
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
              title={`${x.item.currencyCode} ${x.item.originalAmount.toFixed(2)} · ${x.remainder.toFixed(2)} left`}
              trailing={p.selectedItemIds[x.item.id] ? <AppIcon name="checkCircle2" /> : undefined}
            />
          </PressScaleTouchable>
        ))}
      </Stack>
    </AppCard>
  );
}
