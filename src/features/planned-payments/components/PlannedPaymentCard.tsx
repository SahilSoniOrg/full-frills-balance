import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import {
  Icon,
  AppIcon,
  AppSurface,
  Badge,
  PressScaleTouchable,
  type IconName,
  AppText,
} from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Theme } from '@/src/constants/design-tokens';
import { Box, Column, Row } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { PlannedPaymentInterval, PlannedPaymentStatus } from '@/src/types/enums';
import { getSmartDateLabel } from '@/src/utils/dateUtils';
import type { PlannedPaymentObligation } from '@/src/services/planned-payment/plannedPaymentReadService';

export interface PlannedPaymentCardProps {
  item: PlannedPaymentObligation;
  onPress: () => void;
}

export interface PlannedPaymentCardViewModel {
  name: string;
  amount: number;
  currencyCode: string;
  amountColor: 'error' | 'success' | 'secondary';
  flowDirection: 'inflow' | 'outflow' | 'transfer' | 'unknown';
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
  item: PlannedPaymentObligation,
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

  const nextDate = item.nextDueOccurrence;
  const dateValue =
    nextDate === undefined ? Number.MAX_SAFE_INTEGER : new Date(nextDate).setHours(0, 0, 0, 0);
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
    amountColor:
      item.flowDirection === 'outflow'
        ? 'error'
        : item.flowDirection === 'inflow'
          ? 'success'
          : 'secondary',
    flowDirection: item.flowDirection,
    intervalLabel: getIntervalLabel(),
    statusBadge,
    dateLabel:
      nextDate === undefined
        ? AppConfig.strings.plannedPayments.noUpcomingOccurrence
        : `Next: ${getSmartDateLabel(nextDate)}`,
    dateColor,
    iconName:
      item.flowDirection === 'outflow'
        ? Icon.TrendingDown
        : item.flowDirection === 'inflow'
          ? Icon.TrendingUp
          : Icon.SwapHorizontal,
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
                background={
                  vm.amountColor === 'error'
                    ? 'error'
                    : vm.amountColor === 'success'
                      ? 'success'
                      : 'surfaceSecondary'
                }
                backgroundOpacity="soft"
              >
                <AppIcon name={vm.iconName} color={vm.amountColor} size={Size.iconSm} />
              </Box>
              <Column flex={1}>
                <AppText variant="body" weight="bold" numberOfLines={1}>
                  {vm.name}
                </AppText>
                <Row align="center" gap="sm" marginTop="xs">
                  <AppText variant="caption" color="secondary" style={{ opacity: 0.6 }}>
                    {vm.intervalLabel}
                  </AppText>
                  <Badge variant={vm.statusBadge.variant} size="sm" icon={vm.statusBadge.icon}>
                    {vm.statusBadge.text}
                  </Badge>
                </Row>
              </Column>
            </Row>

            <Column align="flex-end">
              <AppText variant="bodyLarge" weight="bold" color={vm.amountColor}>
                {formatMoney(vm.amount, vm.currencyCode)}
              </AppText>
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
              <AppText variant="caption" weight="medium" style={{ color: vm.dateColor }}>
                {vm.dateLabel}
              </AppText>
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
