import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { Stack } from '@/src/design-system';
import type { ReportSection } from '@/src/services/reports-v2/types/result';
import { StyleSheet, View } from 'react-native';
import { ReportsV2Breakdown } from './ReportsV2Breakdown';
import { ReportsV2MetricGrid } from './ReportsV2MetricGrid';
import { ReportsV2VisualizationCard } from './ReportsV2VisualizationCard';
import type { ReportsV2ExplanationContext } from './reportExplanations';

export function ReportsV2SectionContent({
  section,
  explanationContext,
  dataNotes,
  onDrilldown,
  interactive = true,
}: {
  section: ReportSection;
  explanationContext: ReportsV2ExplanationContext;
  dataNotes: readonly string[];
  onDrilldown: (input: {
    label: string;
    accountIds?: readonly string[];
    journalIds?: readonly string[];
    flowClassifications?: readonly ('EXPENSE' | 'REFUND')[];
    startDate?: number;
    endDate?: number;
  }) => void;
  interactive?: boolean;
}) {
  return (
    <Stack gap="md">
      <View style={styles.sectionHeading}>
        <AppText variant="caption" color="secondary" weight="bold" style={styles.eyebrow}>
          REPORT VIEW
        </AppText>
        <AppText variant="xl">{section.title}</AppText>
      </View>
      <ReportsV2MetricGrid section={section} context={explanationContext} dataNotes={dataNotes} />
      {(section.visualizations ?? []).map((visualization, index) => (
        <ReportsV2VisualizationCard
          key={`${section.id}-visual-${index}`}
          sectionId={section.id}
          visualization={visualization}
          context={explanationContext}
          dataNotes={dataNotes}
          onDrilldown={onDrilldown}
          interactive={interactive}
        />
      ))}
      {section.rows ? (
        <ReportsV2Breakdown
          section={section}
          context={explanationContext}
          dataNotes={dataNotes}
          onDrilldown={onDrilldown}
          interactive={interactive}
        />
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  sectionHeading: { gap: Spacing.xs },
  eyebrow: { letterSpacing: 1.2 },
});
