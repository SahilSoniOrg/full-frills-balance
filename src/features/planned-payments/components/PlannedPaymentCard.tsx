import { getNow, getSmartDateLabel } from '@/src/utils/dateHelpers';
import { AppIcon, AppSurface, Badge } from '@/src/components/core';
import { AppConfig, Opacity, Spacing } from '@/src/constants';
import { Box, Column, Row, Text } from '@/src/design-system';
import PlannedPayment, {
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/data/models/PlannedPayment';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { TouchableOpacity } from 'react-native';

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
  const today = new Date(getNow()).setHours(0, 0, 0, 0);
  const tomorrow = new Date(getNow() + 86400000).setHours(0, 0, 0, 0);
  const isActive = item.status === PlannedPaymentStatus.ACTIVE;

  const isOverdue = isActive && dateValue < today;
  const isDueSoon = isActive && (dateValue === today || dateValue === tomorrow);

  let dateColor = theme.textSecondary;
  if (isOverdue) dateColor = theme.error;
  else if (isDueSoon) dateColor = theme.warning;

  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={Opacity.heavy}
      style={{ marginBottom: Spacing.md }}
    >
      <AppSurface
        elevation="sm"
        padding="lg"
        radius="r3"
        background="surface"
        borderWidth={1}
        borderColor="surfaceSecondary"
      >
        <Column gap="md">
          <Row justify="space-between" align="center">
            <Row gap="md" align="center" flex={1}>
              <Box
                width={40}
                height={40}
                borderRadius="md"
                alignItems="center"
                justifyContent="center"
                background={item.amount < 0 ? 'error' : 'success'}
                backgroundOpacity="soft"
              >
                <AppIcon
                  name={item.amount < 0 ? 'trendingDown' : 'trendingUp'}
                  color={item.amount < 0 ? 'error' : 'success'}
                  size={20}
                />
              </Box>
              <Column flex={1}>
                <Text variant="base" weight="bold" numberOfLines={1}>
                  {item.name}
                </Text>
                <Row align="center" gap="sm" marginTop="xs">
                  <Text variant="xs" color="secondary" opacity={0.6}>
                    {getIntervalLabel()}
                  </Text>
                  {item.status === PlannedPaymentStatus.PAUSED ? (
                    <Badge variant="default" size="sm">
                      {AppConfig.strings.plannedPayments.statusPaused}
                    </Badge>
                  ) : isOverdue ? (
                    <Badge variant="error" size="sm" icon="alert">
                      Overdue
                    </Badge>
                  ) : isDueSoon ? (
                    <Badge variant="warning" size="sm" icon="time">
                      Due Soon
                    </Badge>
                  ) : (
                    <Badge variant="success" size="sm" icon="calendar">
                      Active
                    </Badge>
                  )}
                </Row>
              </Column>
            </Row>

            <Column align="flex-end">
              <Text variant="lg" weight="bold" color={item.amount < 0 ? 'error' : 'success'}>
                {CurrencyFormatter.format(item.amount, item.currencyCode)}
              </Text>
            </Column>
          </Row>

          <Box height={1} background="surfaceSecondary" opacity={0.5} />

          <Row justify="space-between" align="center">
            <Row align="center" gap="xs">
              <AppIcon name={isOverdue ? 'alert' : 'calendar'} size={14} color={dateColor} />
              <Text variant="xs" weight="medium" style={{ color: dateColor }}>
                Next: {getSmartDateLabel(item.nextOccurrence)}
              </Text>
            </Row>
            <AppIcon name="chevronRight" size={16} color={theme.textSecondary} opacity={0.4} />
          </Row>
        </Column>
      </AppSurface>
    </TouchableOpacity>
  );
}
