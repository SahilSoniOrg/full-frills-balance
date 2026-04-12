import { AppCard, AppText } from '@/src/components/core';
import { AppConfig, Spacing } from '@/src/constants';
import { Box, Inline, Stack } from '@/src/design-system';
import PlannedPayment, {
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/data/models/PlannedPayment';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, TouchableOpacity } from 'react-native';

export interface PlannedPaymentCardProps {
  item: PlannedPayment;
  onPress: () => void;
}

export function PlannedPaymentCard({ item, onPress }: PlannedPaymentCardProps) {
  const { theme } = useTheme();

  const getIntervalLabel = () => {
    const n = item.intervalN;
    const type = item.intervalType.toLowerCase();
    if (n === 1) {
      switch (item.intervalType) {
        case PlannedPaymentInterval.DAILY:
          return AppConfig.strings.plannedPayments.everyDay;
        case PlannedPaymentInterval.WEEKLY:
          return AppConfig.strings.plannedPayments.everyWeek;
        case PlannedPaymentInterval.MONTHLY:
          return AppConfig.strings.plannedPayments.everyMonth;
        case PlannedPaymentInterval.YEARLY:
          return AppConfig.strings.plannedPayments.everyYear;
      }
    }
    return AppConfig.strings.plannedPayments.everyN(n, type);
  };

  const dateValue = new Date(item.nextOccurrence).setHours(0, 0, 0, 0);
  const today = new Date().setHours(0, 0, 0, 0);
  const tomorrow = new Date(Date.now() + 86400000).setHours(0, 0, 0, 0);
  const isActive = item.status === PlannedPaymentStatus.ACTIVE;

  const isOverdue = isActive && dateValue < today;
  const isDueSoon = isActive && (dateValue === today || dateValue === tomorrow);

  let dateColor = theme.textSecondary;
  if (isOverdue) dateColor = theme.error;
  else if (isDueSoon) dateColor = theme.warning;

  return (
    <AppCard elevation="sm" padding="md" radius="r2" style={styles.card}>
      <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
        <Stack gap="sm">
          <Inline justify="space-between" align="flex-start">
            <Stack gap="xs" flex={1}>
              <AppText variant="body" weight="semibold">
                {item.name}
              </AppText>
              <AppText variant="caption" color="secondary">
                {getIntervalLabel()}
              </AppText>
            </Stack>
            <AppText
              variant="body"
              weight="bold"
              style={{ color: item.amount < 0 ? theme.error : theme.success }}
            >
              {CurrencyFormatter.format(item.amount, item.currencyCode)}
            </AppText>
          </Inline>

          <Inline justify="space-between" align="center">
            <Inline gap="xs" align="center">
              <Ionicons
                name={
                  isOverdue
                    ? 'alert-circle-outline'
                    : isDueSoon
                      ? 'time-outline'
                      : 'calendar-outline'
                }
                size={14}
                color={dateColor}
              />
              <AppText variant="caption" style={{ color: dateColor }}>
                {AppConfig.strings.plannedPayments.nextOccurrence(
                  new Date(item.nextOccurrence).toLocaleDateString(),
                )}
              </AppText>
            </Inline>

            {item.status === PlannedPaymentStatus.PAUSED && (
              <Box
                background="surfaceSecondary"
                paddingHorizontal="xs"
                paddingVertical="xs"
                borderRadius="sm"
              >
                <AppText variant="caption" color="secondary">
                  {AppConfig.strings.plannedPayments.statusPaused}
                </AppText>
              </Box>
            )}
          </Inline>
        </Stack>
      </TouchableOpacity>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  card: {
    marginBottom: Spacing.md,
  },
});
