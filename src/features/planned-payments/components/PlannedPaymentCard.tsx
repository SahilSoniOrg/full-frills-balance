import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import {
  Icon,
  AppIcon,
  AppSurface,
  Badge,
  PressScaleTouchable,
  type IconName,
} from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { Box, Column, Row, Text } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { PlainPlannedPayment } from '@/src/types/plainDtos';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { getSmartDateLabel } from '@/src/utils/dateUtils';

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
    icon: IconName;
    text: string;
  };
  dateLabel: string;
  dateColor: string;
  iconName: IconName;
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
  const today = new Date().setHours(0, 0, 0, 0);
  const tomorrow = new Date(Date.now() + 86400000).setHours(0, 0, 0, 0);
  const isActive = item.status === PlannedPaymentStatus.ACTIVE;

  const isOverdue = isActive && dateValue < today;
  const isDueSoon = isActive && (dateValue === today || dateValue === tomorrow);

  let dateColor = theme.textSecondary;
  if (isOverdue) dateColor = theme.error;
  else if (isDueSoon) dateColor = theme.warning;

  let statusBadge: PlannedPaymentCardViewModel['statusBadge'] = {
    variant: 'success',
    icon: Icon.Calendar,
    text: AppConfig.strings.plannedPayments.statusActive,
  };

  if (item.status === PlannedPaymentStatus.PAUSED) {
    statusBadge = {
      variant: 'default',
      icon: Icon.Document,
      text: AppConfig.strings.plannedPayments.statusPaused,
    };
  } else if (isOverdue) {
    statusBadge = {
      variant: 'error',
      icon: Icon.Alert,
      text: AppConfig.strings.plannedPayments.statusOverdue,
    };
  } else if (isDueSoon) {
    statusBadge = {
      variant: 'warning',
      icon: Icon.Clock,
      text: AppConfig.strings.plannedPayments.statusDueSoon,
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
    iconName: item.amount < 0 ? Icon.TrendingDown : Icon.TrendingUp,
    isOverdue,
  };
}

function PlannedPaymentCardComponent({ item, onPress }: PlannedPaymentCardProps) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const vm = presentPlannedPaymentCard(item, theme);

  return (
    <PressScaleTouchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={vm.name}
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
                width={Size.xl}
                height={Size.xl}
                borderRadius="md"
                alignItems="center"
                justifyContent="center"
                background={vm.amountColor === 'error' ? 'error' : 'success'}
                backgroundOpacity="soft"
              >
                <AppIcon name={vm.iconName} color={vm.amountColor} size={Size.iconSm} />
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
              <AppIcon
                name={vm.isOverdue ? Icon.Alert : Icon.Calendar}
                size={Size.xxs}
                color={vm.dateColor}
              />
              <Text variant="xs" weight="medium" style={{ color: vm.dateColor }}>
                {vm.dateLabel}
              </Text>
            </Row>
            <AppIcon
              name={Icon.ChevronRight}
              size={Size.iconXs}
              color={theme.textSecondary}
              opacity={0.4}
            />
          </Row>
        </Column>
      </AppSurface>
    </PressScaleTouchable>
  );
}

export const PlannedPaymentCard = PlannedPaymentCardComponent;
