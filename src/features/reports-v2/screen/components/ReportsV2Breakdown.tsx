import { PressScaleTouchable } from '@/src/components/core/PressScaleTouchable';
import { AppButton, AppCard, AppIcon, AppText, EmptyStateView, Icon } from '@/src/components/core';
import { ContextualExplanation } from '@/src/components/shared/ContextualExplanation';
import { Spacing } from '@/src/constants/design-tokens';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReportSection } from '@/src/services/reports-v2/types/result';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MeasureText } from './ReportsV2MetricGrid';
import {
  explanationContextItems,
  explanationForBudgetUtilization,
  type ReportsV2ExplanationContext,
} from './reportExplanations';

function measureNumber(measure: NonNullable<ReportSection['rows']>[number]['value']): number {
  return measure.kind === 'MONEY' ? measure.amount : (measure.value ?? 0);
}

export function ReportsV2Breakdown({
  section,
  context,
  dataNotes,
  onDrilldown,
  interactive = true,
}: {
  section: ReportSection;
  context: ReportsV2ExplanationContext;
  dataNotes: readonly string[];
  onDrilldown: (input: {
    label: string;
    accountIds?: readonly string[];
    journalIds?: readonly string[];
  }) => void;
  interactive?: boolean;
}) {
  const { theme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  if (!section.rows?.length)
    return (
      <EmptyStateView
        title="No activity in this period"
        subtitle="Try a wider range or include planned activity."
      />
    );
  const maximum = Math.max(1, ...section.rows.map(item => Math.abs(measureNumber(item.value))));
  const budgetUtilization =
    section.id === 'budgets' ? explanationForBudgetUtilization() : undefined;
  return (
    <AppCard paddingSize="none">
      <View style={styles.breakdownHeader}>
        <View style={styles.headerCopy}>
          <View style={styles.headingRow}>
            <AppText variant="heading" weight="semibold">
              Details
            </AppText>
            {budgetUtilization ? (
              <ContextualExplanation
                title={budgetUtilization.title}
                meaning={budgetUtilization.meaning}
                interpretation={budgetUtilization.interpretation}
                unit={budgetUtilization.unit ?? 'Percent of budget'}
                context={explanationContextItems(context)}
                dataNotes={dataNotes}
                testID="reports-v2-explain-budget-utilization"
              />
            ) : null}
          </View>
          <AppText variant="caption" color="secondary">
            {interactive
              ? 'Tap a row to inspect its journals'
              : 'Details will be available when the update finishes'}
          </AppText>
        </View>
        <AppText variant="caption" color="secondary">
          {section.rows.length} items
        </AppText>
      </View>
      {(expanded ? section.rows : section.rows.slice(0, 12)).map((item, index) => (
        <PressScaleTouchable
          pressScale="subtle"
          key={item.id}
          onPress={() => {
            if (!interactive) return;
            onDrilldown({
              label: item.label,
              accountIds: item.accountIds,
              journalIds: item.journalIds,
            });
          }}
          disabled={!interactive}
          accessibilityRole="button"
          accessibilityLabel={`Open ${item.label} details`}
          accessibilityState={{ disabled: !interactive }}
          style={[
            styles.breakdownRow,
            !interactive && styles.breakdownRowDisabled,
            index > 0 && styles.rowBorder,
            index > 0 && { borderTopColor: theme.divider },
          ]}
        >
          <View style={styles.rowCopy}>
            <AppText variant="body" weight="medium">
              {item.label}
            </AppText>
            <View style={[styles.rowTrack, { backgroundColor: theme.surfaceSecondary }]}>
              <View
                style={[
                  styles.rowFill,
                  {
                    width: `${Math.min(100, (Math.abs(measureNumber(item.value)) / maximum) * 100)}%`,
                    backgroundColor: measureNumber(item.value) < 0 ? theme.error : theme.primary,
                  },
                ]}
              />
            </View>
          </View>
          <View style={styles.rowValue}>
            <MeasureText measure={item.value} variant="body" weight="semibold" />
            {item.percentage && item.percentage.value !== null ? (
              <AppText variant="caption" color="secondary">
                {item.percentage.value.toFixed(1)}%
              </AppText>
            ) : item.percentage ? (
              <AppText variant="caption" color="secondary">
                Unavailable
              </AppText>
            ) : null}
          </View>
          <AppIcon name={Icon.ChevronRight} size={17} color="textTertiary" />
        </PressScaleTouchable>
      ))}
      {section.rows.length > 12 ? (
        <AppButton
          variant="ghost"
          size="sm"
          onPress={() => setExpanded(value => !value)}
          accessibilityLabel={
            expanded ? 'Show fewer details' : `Show all ${section.rows.length} details`
          }
          style={styles.showMoreButton}
        >
          {expanded ? 'Show less' : `Show all ${section.rows.length}`}
        </AppButton>
      ) : null}
    </AppCard>
  );
}

const styles = StyleSheet.create({
  breakdownHeader: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.lg,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerCopy: { flex: 1, gap: Spacing.xs },
  headingRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  breakdownRow: {
    minHeight: 78,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  breakdownRowDisabled: { opacity: 0.6 },
  rowBorder: { borderTopWidth: 1 },
  rowCopy: { flex: 1, minWidth: 0, gap: Spacing.sm },
  rowTrack: { height: 5, borderRadius: 5, overflow: 'hidden' },
  rowFill: { height: 5, borderRadius: 5 },
  showMoreButton: { alignSelf: 'center', marginVertical: Spacing.sm },
  rowValue: { alignItems: 'flex-end', minWidth: 76, gap: Spacing.xs },
});
