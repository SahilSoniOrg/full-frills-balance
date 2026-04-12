import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { AppText } from '@/src/components/core';
import { Box, Stack } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { AppConfig, Spacing } from '@/src/constants';

interface SafeToSpendBreakdownBarProps {
  effectiveTotal: number;
  committedTotal: number;
  committedLiabilities: number;
  safeToSpend: number;
  displaySafe: string | React.ReactNode;
  displayCommitted: string | React.ReactNode;
  displayDebts: string | React.ReactNode;
  onLegendPress: (item: 'safe' | 'committed' | 'debts') => void;
}

export const SafeToSpendBreakdownBar = ({
  effectiveTotal,
  committedTotal,
  committedLiabilities,
  safeToSpend,
  displaySafe,
  displayCommitted,
  displayDebts,
  onLegendPress,
}: SafeToSpendBreakdownBarProps) => {
  const { theme } = useTheme();
  const labels = AppConfig.strings.dashboard.safeToSpendUi;

  if (effectiveTotal <= 0) {
    return (
      <View style={styles.emptyState}>
        <AppText variant="caption" color="secondary">
          {AppConfig.strings.dashboard.noDataForBreakdown}
        </AppText>
      </View>
    );
  }

  return (
    <Stack gap="md">
      <Box
        background="surfaceSecondary"
        height={12}
        borderRadius="full"
        flexDirection="row"
        overflow="hidden"
        marginBottom="md"
      >
        {committedTotal > 0 && (
          <View
            style={[
              styles.progressSegment,
              { flex: committedTotal, backgroundColor: theme.warning },
            ]}
          />
        )}
        {committedLiabilities > 0 && (
          <View
            style={[
              styles.progressSegment,
              { flex: committedLiabilities, backgroundColor: theme.error },
            ]}
          />
        )}
        {safeToSpend > 0 && (
          <View
            style={[styles.progressSegment, { flex: safeToSpend, backgroundColor: theme.primary }]}
          />
        )}
      </Box>

      <View style={styles.legendContainer}>
        <TouchableOpacity style={styles.legendItem} onPress={() => onLegendPress('safe')}>
          <View style={[styles.legendDot, { backgroundColor: theme.primary }]} />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <AppText variant="caption" color="secondary">
              {labels.safePrefix}
            </AppText>
            <AppText variant="caption" weight="bold" color="primary">
              {displaySafe}
            </AppText>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.legendItem} onPress={() => onLegendPress('committed')}>
          <View style={[styles.legendDot, { backgroundColor: theme.warning }]} />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <AppText variant="caption" color="secondary">
              {labels.committedPrefix}
            </AppText>
            <AppText variant="caption" weight="bold" color="warning">
              {displayCommitted}
            </AppText>
          </View>
        </TouchableOpacity>
        <TouchableOpacity style={styles.legendItem} onPress={() => onLegendPress('debts')}>
          <View style={[styles.legendDot, { backgroundColor: theme.error }]} />
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <AppText variant="caption" color="secondary">
              {labels.debtsPrefix}
            </AppText>
            <AppText variant="caption" weight="bold" color="error">
              {displayDebts}
            </AppText>
          </View>
        </TouchableOpacity>
      </View>
    </Stack>
  );
};

const styles = StyleSheet.create({
  progressSegment: {
    height: '100%',
  },
  legendContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  emptyState: {
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
});
