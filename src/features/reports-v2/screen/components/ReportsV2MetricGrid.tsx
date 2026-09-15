import { AppCard, AppText, type AppTextProps } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { useTheme } from '@/src/hooks/use-theme';
import type { ReportMeasure } from '@/src/services/reports-v2/types/measure';
import type { ReportSection } from '@/src/services/reports-v2/types/result';
import { Spacing } from '@/src/constants/design-tokens';
import { View, StyleSheet } from 'react-native';

type NonMoneyMeasure = Exclude<ReportMeasure, { kind: 'MONEY' }>;

function measureText(measure: NonMoneyMeasure): string {
  if (measure.kind === 'PERCENTAGE') {
    return measure.value === null ? 'Unavailable' : `${measure.value.toFixed(1)}%`;
  }
  if (measure.kind === 'COUNT') return `${measure.value}`;
  return measure.value.toFixed(2);
}

type MeasureTextProps = { measure: ReportMeasure } & Omit<AppTextProps, 'children'>;

export function MeasureText({ measure, ...textProps }: MeasureTextProps) {
  if (measure.kind === 'MONEY') {
    return <MoneyText {...textProps} amount={measure.amount} currencyCode={measure.currencyCode} />;
  }

  return <AppText {...textProps}>{measureText(measure)}</AppText>;
}

function metricTone(measure: ReportMeasure): 'income' | 'expense' | 'default' {
  if (measure.kind !== 'MONEY') return 'default';
  return measure.amount < 0 ? 'expense' : 'income';
}

export function ReportsV2MetricGrid({ section }: { section: ReportSection }) {
  const { theme } = useTheme();
  return (
    <View style={styles.metricGrid}>
      {(section.metrics ?? []).map(item => {
        const tone = metricTone(item.value);
        const color =
          tone === 'income' ? theme.success : tone === 'expense' ? theme.error : theme.text;
        const change = item.comparison?.percentageChange;
        return (
          <AppCard
            key={item.id}
            variant="secondary"
            paddingSize="sm"
            style={[styles.metricCard, { borderTopColor: color }]}
          >
            <AppText variant="caption" color="secondary" numberOfLines={1}>
              {item.label}
            </AppText>
            <MeasureText
              measure={item.value}
              variant="subheading"
              weight="bold"
              style={{ color }}
            />
            {change !== undefined && change !== null ? (
              <AppText variant="caption" color="secondary" numberOfLines={1}>
                {change > 0 ? '+' : ''}
                {change.toFixed(1)}% vs prior
              </AppText>
            ) : (
              <AppText variant="caption" color="secondary">
                Current period
              </AppText>
            )}
          </AppCard>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  metricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  metricCard: { flexGrow: 1, flexBasis: '30%', minWidth: 112, borderTopWidth: 2 },
});
