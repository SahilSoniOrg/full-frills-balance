import { AppCard, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { StyleSheet } from 'react-native';

interface ReportNoDataProps {
  zIndex?: number;
}

export function ReportNoData({ zIndex }: ReportNoDataProps) {
  return (
    <AppCard paddingSize="lg" style={[styles.card, { zIndex, overflow: 'visible' }]}>
      <AppText variant="body" color="secondary" style={styles.text}>
        {AppConfig.strings.reports.noData}
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.xl,
  },
  text: {
    textAlign: 'center',
  },
});
