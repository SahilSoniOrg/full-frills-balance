import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants';
import { Fragment, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

type TimedItem = {
  amount: number;
  dayOffset?: number;
};

type TimingGroupedBreakdownProps<T extends TimedItem> = {
  items: readonly T[];
  firstMajorInflowDay: number | null;
  formatTotal: (total: number) => string;
  totalColor?: 'warning' | 'error';
  beforeTitle?: string;
  afterTitle?: string;
  renderItem: (item: T) => ReactNode;
};

/** Groups timed STS items into before/after major-income buckets with section totals. */
export function TimingGroupedBreakdown<T extends TimedItem>({
  items,
  firstMajorInflowDay,
  formatTotal,
  totalColor = 'warning',
  beforeTitle = 'Due Before Major Income',
  afterTitle = 'Due After Major Income',
  renderItem,
}: TimingGroupedBreakdownProps<T>) {
  const threshold = firstMajorInflowDay || 0;
  const before = items.filter(item => (item.dayOffset ?? 0) < threshold);
  const after = items.filter(item => (item.dayOffset ?? 0) >= threshold);

  const renderGroup = (group: readonly T[], title: string) => {
    if (group.length === 0) return null;
    const total = group.reduce((sum, item) => sum + item.amount, 0);
    return (
      <View key={title} style={styles.group}>
        <View style={styles.header}>
          <AppText variant="overline" color="secondary">
            {title}
          </AppText>
          <AppText variant="caption" weight="bold" color={totalColor}>
            {formatTotal(total)}
          </AppText>
        </View>
        <View style={styles.items}>
          {group.map((item, index) => (
            // Detail ids can repeat across accounts; position in the group is unique.
            <Fragment key={index}>{renderItem(item)}</Fragment>
          ))}
        </View>
      </View>
    );
  };

  return (
    <>
      {renderGroup(before, beforeTitle)}
      {firstMajorInflowDay !== null ? renderGroup(after, afterTitle) : null}
    </>
  );
}

const styles = StyleSheet.create({
  group: {
    marginBottom: Spacing.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  items: {
    gap: Spacing.md,
  },
});
