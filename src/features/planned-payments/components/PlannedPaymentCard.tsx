import { useMoneyFormat } from '@/src/components/common/moneyFormat';
import { AppIcon, AppSurface, Badge } from '@/src/components/core';
import { AppConfig, Opacity, Spacing } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { Box, Column, Row, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import {
  PlainPlannedPayment,
  PlannedPaymentInterval,
  PlannedPaymentStatus,
} from '@/src/types/domain';
import { getNow, getSmartDateLabel } from '@/src/utils/dateHelpers';
import { TouchableOpacity } from 'react-native';

export interface PlannedPaymentCardProps {
  item: PlainPlannedPayment;
  onPress: () => void;
}

export interface PlannedPaymentCardViewModel {
  name: string;
  amount: number;
  currencyCode: string;
  amountColor: 'error' | 'success';
  intervalLabel: string;
  statusBadge: {
    variant: 'default' | 'error' | 'warning' | 'success';
    icon: 'alert' | 'time' | 'calendar' | 'document';
    text: string;
  };
  dateLabel: string;
  dateColor: string;
  iconName: 'trendingDown' | 'trendingUp';
  isOverdue: boolean;
}

export function presentPlannedPaymentCard(
  item: PlainPlannedPayment,
  theme: Theme,
): PlannedPaymentCardViewModel {
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

  let statusBadge: PlannedPaymentCardViewModel['statusBadge'] = {
    variant: 'success',
    icon: 'calendar',
    text: 'Active',
  };

  if (item.status === PlannedPaymentStatus.PAUSED) {
    statusBadge = {
      variant: 'default',
      icon: 'document',
      text: AppConfig.strings.plannedPayments.statusPaused,
    };
  } else if (isOverdue) {
    statusBadge = {
      variant: 'error',
      icon: 'alert',
      text: 'Overdue',
    };
  } else if (isDueSoon) {
    statusBadge = {
      variant: 'warning',
      icon: 'time',
      text: 'Due Soon',
    };
  }

  return {
    name: item.name,
    amount: item.amount,
    currencyCode: item.currencyCode,
    amountColor: item.amount < 0 ? 'error' : 'success',
    intervalLabel: getIntervalLabel(),
    statusBadge,
    dateLabel: `Next: ${getSmartDateLabel(item.nextOccurrence)}`,
    dateColor,
    iconName: item.amount < 0 ? 'trendingDown' : 'trendingUp',
    isOverdue,
  };
}

function PlannedPaymentCardComponent({ item, onPress }: PlannedPaymentCardProps) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const vm = presentPlannedPaymentCard(item, theme);

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
                background={vm.amountColor === 'error' ? 'error' : 'success'}
                backgroundOpacity="soft"
              >
                <AppIcon name={vm.iconName} color={vm.amountColor} size={20} />
              </Box>
              <Column flex={1}>
                <Text variant="base" weight="bold" numberOfLines={1}>
                  {vm.name}
                </Text>
                <Row align="center" gap="sm" marginTop="xs">
                  <Text variant="xs" color="secondary" opacity={0.6}>
                    {vm.intervalLabel}
                  </Text>
                  <Badge variant={vm.statusBadge.variant} size="sm" icon={vm.statusBadge.icon}>
                    {vm.statusBadge.text}
                  </Badge>
                </Row>
              </Column>
            </Row>

            <Column align="flex-end">
              <Text variant="lg" weight="bold" color={vm.amountColor}>
                {formatMoney(vm.amount, vm.currencyCode)}
              </Text>
            </Column>
          </Row>

          <Box height={1} background="surfaceSecondary" opacity={0.5} />

          <Row justify="space-between" align="center">
            <Row align="center" gap="xs">
              <AppIcon name={vm.isOverdue ? 'alert' : 'calendar'} size={14} color={vm.dateColor} />
              <Text variant="xs" weight="medium" style={{ color: vm.dateColor }}>
                {vm.dateLabel}
              </Text>
            </Row>
            <AppIcon name="chevronRight" size={16} color={theme.textSecondary} opacity={0.4} />
          </Row>
        </Column>
      </AppSurface>
    </TouchableOpacity>
  );
}

export const PlannedPaymentCard = PlannedPaymentCardComponent;
