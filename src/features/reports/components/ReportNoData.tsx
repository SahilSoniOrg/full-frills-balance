import { AppCard, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { StyleSheet } from 'react-native';

export function ReportNoData() {
  return (
    <AppCard paddingSize="lg" style={styles.card}>
      <AppText variant="body" color="secondary" style={styles.text}>
        {AppConfig.strings.reports.noData}
      </AppText>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.xl,
    overflow: 'visible',
  },
  text: {
    textAlign: 'center',
  },
});
