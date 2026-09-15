import { AppText } from '@/src/components/core';
import { Spacing } from '@/src/constants/design-tokens';
import { Stack } from '@/src/design-system';
import type { ReportSection } from '@/src/services/reports-v2/types/result';
import { StyleSheet, View } from 'react-native';
import { ReportsV2Breakdown } from './ReportsV2Breakdown';
import { ReportsV2MetricGrid } from './ReportsV2MetricGrid';
import { ReportsV2TrendCard } from './ReportsV2TrendCard';

export function ReportsV2SectionContent({
  section,
  onDrilldown,
  interactive = true,
}: {
  section: ReportSection;
  onDrilldown: (input: {
    label: string;
    accountIds?: readonly string[];
    journalIds?: readonly string[];
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
      <ReportsV2MetricGrid section={section} />
      {(section.visualizations ?? []).map((visualization, index) => (
        <ReportsV2TrendCard key={`${section.id}-visual-${index}`} visualization={visualization} />
      ))}
      {section.rows ? (
        <ReportsV2Breakdown section={section} onDrilldown={onDrilldown} interactive={interactive} />
      ) : null}
    </Stack>
  );
}

const styles = StyleSheet.create({
  sectionHeading: { gap: Spacing.xs },
  eyebrow: { letterSpacing: 1.2 },
});
