import {
  AppButton,
  AppCard,
  AppText,
  EmptyStateView,
  ListGroup,
  ListRow,
} from '@/src/components/core';
import { ContextualExplanation } from '@/src/components/shared/ContextualExplanation';
import { Shape, Size, Spacing } from '@/src/constants/design-tokens';
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

const COLLAPSED_ROW_LIMIT = 12;

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
        style={styles.empty}
      />
    );
  const maximum = Math.max(1, ...section.rows.map(item => Math.abs(measureNumber(item.value))));
  const budgetUtilization =
    section.id === 'budgets' ? explanationForBudgetUtilization() : undefined;
  return (
    <AppCard padding="none">
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
      <ListGroup variant="plain">
        {(expanded ? section.rows : section.rows.slice(0, COLLAPSED_ROW_LIMIT)).map(item => {
          const value = measureNumber(item.value);
          return (
            <ListRow
              key={item.id}
              title={item.label}
              wrap
              disabled={!interactive}
              onPress={() => {
                if (!interactive) return;
                onDrilldown({
                  label: item.label,
                  accountIds: item.accountIds,
                  journalIds: item.journalIds,
                });
              }}
              accessibilityLabel={`Open ${item.label} details`}
              accessibilityState={{ disabled: !interactive }}
              subtitle={
                <View style={[styles.rowTrack, { backgroundColor: theme.surfaceSecondary }]}>
                  <View
                    style={[
                      styles.rowFill,
                      {
                        width: `${Math.min(100, (Math.abs(value) / maximum) * 100)}%`,
                        backgroundColor: value < 0 ? theme.error : theme.primary,
                      },
                    ]}
                  />
                </View>
              }
              trailing={
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
              }
              chevron={interactive}
            />
          );
        })}
      </ListGroup>
      {section.rows.length > COLLAPSED_ROW_LIMIT ? (
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
  empty: { flex: 0 },
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
  rowTrack: {
    height: Spacing.xs,
    borderRadius: Shape.radius.full,
    overflow: 'hidden',
    marginTop: Spacing.sm,
  },
  rowFill: { height: Spacing.xs, borderRadius: Shape.radius.full },
  showMoreButton: { alignSelf: 'center', marginVertical: Spacing.sm },
  rowValue: { alignItems: 'flex-end', minWidth: Size.fieldNarrow, gap: Spacing.xs },
});
