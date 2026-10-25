import { AppCard } from '@/src/components/core';
import { EmptyStateView } from '@/src/components/shared/EmptyStateView';
import { AppConfig, Spacing } from '@/src/constants';
import { StyleSheet } from 'react-native';

export function ReportNoData() {
  return (
    <AppCard paddingSize="lg" style={styles.card}>
      <EmptyStateView title={AppConfig.strings.reports.noData} style={styles.empty} />
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.xl,
    overflow: 'visible',
  },
  empty: {
    flex: 0,
    padding: 0,
  },
});
