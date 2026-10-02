import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import {
  Icon,
  AppIcon,
  AppSurface,
  PressScaleTouchable,
  type IconName,
  AppText,
} from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { Column, Row } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import { PlannedPaymentStatus } from '@/src/types/enums';
import { getNow, getSmartDateLabel } from '@/src/utils/dateUtils';
import {
  formatPlannedPaymentInterval,
  presentPlannedPaymentDue,
} from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';
import dayjs from 'dayjs';
import type { PlannedPaymentObligation } from '@/src/services/planned-payment/plannedPaymentReadService';
import { formatRecurrence } from '@/src/utils/recurrenceLabels';
import { getVariantMainColor, type ComponentVariant } from '@/src/utils/style-helpers';
import { View } from 'react-native';
import { AccountInlineLabel } from '@/src/components/accounts/AccountInlineLabel';

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
  intervalSummary: string;
  fromAccountLabel: string;
  toAccountLabel: string;
  postingLabel: string;
  endDateLabel?: string;
  statusBadge?: {
    variant: 'default' | 'error' | 'warning' | 'success';
    icon: IconName;
    text: string;
  };
  dateLabel: string;
  dueSummary: string;
  dueColor: ComponentVariant;
  iconName: IconName;
}

function getStatusBadge(
  item: PlannedPaymentObligation,
  days: number | undefined,
): PlannedPaymentCardViewModel['statusBadge'] {
  const strings = AppConfig.strings.plannedPayments;
  if (item.status === PlannedPaymentStatus.PAUSED) {
    return { variant: 'default', icon: Icon.Pause, text: strings.statusPaused };
  }
  if (days !== undefined && days < 0) {
    return { variant: 'error', icon: Icon.Alert, text: strings.statusOverdue };
  }
  if (days !== undefined && days <= 1) {
    return { variant: 'warning', icon: Icon.Clock, text: strings.statusDueSoon };
  }
  if (item.status === PlannedPaymentStatus.COMPLETED) {
    return {
      variant: 'default',
      icon: Icon.Check,
      text: item.nextDueOccurrence === undefined ? 'Completed' : 'Schedule ended',
    };
  }
  return undefined;
}

export function presentPlannedPaymentCard(
  item: PlannedPaymentObligation,
  now: number = getNow(),
): PlannedPaymentCardViewModel {
  const nextDate = item.nextDueOccurrence;
  const due = presentPlannedPaymentDue(item, now);
  const isOverdue = due.days !== undefined && due.days < 0;

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
    intervalLabel: formatPlannedPaymentInterval(item),
    intervalSummary: formatRecurrence(item, 'short'),
    fromAccountLabel: item.fromAccount?.name ?? 'Unavailable account',
    toAccountLabel: item.toAccount?.name ?? 'Unavailable account',
    postingLabel: item.isAutoPost ? 'Auto-post' : 'Manual posting',
    endDateLabel:
      item.endDate == null ? undefined : `Ends ${dayjs(item.endDate).format('MMM D, YYYY')}`,
    statusBadge: getStatusBadge(item, due.days),
    dateLabel:
      nextDate === undefined
        ? AppConfig.strings.plannedPayments.noUpcomingOccurrence
        : `${isOverdue ? 'Due' : 'Next'}: ${getSmartDateLabel(nextDate)}`,
    dueSummary:
      nextDate === undefined || due.days === undefined || isOverdue
        ? due.label
        : due.days < 7
          ? getSmartDateLabel(nextDate)
          : dayjs(nextDate).format(dayjs(nextDate).isSame(now, 'year') ? 'MMM D' : 'MMM D, YYYY'),
    dueColor: due.color,
    iconName:
      item.flowDirection === 'outflow'
        ? Icon.TrendingDown
        : item.flowDirection === 'inflow'
          ? Icon.TrendingUp
          : Icon.SwapHorizontal,
  };
}

function PlannedPaymentCardComponent({ item, onPress }: PlannedPaymentCardProps) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const vm = presentPlannedPaymentCard(item);
  const dueColor = getVariantMainColor(theme, vm.dueColor);

  return (
    <PressScaleTouchable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[
        vm.name,
        vm.flowDirection === 'inflow'
          ? 'Income'
          : vm.flowDirection === 'outflow'
            ? 'Expense'
            : vm.flowDirection === 'transfer'
              ? 'Transfer'
              : undefined,
        formatMoney(vm.amount, vm.currencyCode),
        vm.intervalLabel,
        `From ${vm.fromAccountLabel} to ${vm.toAccountLabel}`,
        vm.statusBadge?.text,
        vm.dateLabel,
        vm.postingLabel,
        vm.endDateLabel,
      ]
        .filter(Boolean)
        .join('. ')}
      accessibilityHint="Opens planned payment details"
      style={{ marginBottom: Spacing.sm }}
    >
      <AppSurface
        elevation="sm"
        padding="md"
        radius="r3"
        background="surface"
        borderWidth={1}
        borderColor="surfaceSecondary"
      >
        <Column gap="sm">
          <Row justify="space-between" align="flex-start" gap="sm" flexWrap="wrap">
            <Row gap="sm" align="center" flex={1} style={{ minWidth: '40%' }}>
              <AppIcon
                name={vm.iconName}
                color={getVariantMainColor(theme, vm.amountColor)}
                size={Size.iconSm}
              />
              <AppText variant="body" weight="semibold" numberOfLines={2} style={{ flex: 1 }}>
                {vm.name}
              </AppText>
            </Row>

            <AppText
              variant="heading"
              weight="bold"
              style={{ flexShrink: 0, maxWidth: '100%', marginLeft: 'auto' }}
            >
              {formatMoney(vm.amount, vm.currencyCode)}
            </AppText>
          </Row>

          <Row align="center" gap="sm">
            <Row flexShrink={1} style={{ minWidth: 0, maxWidth: '46%' }}>
              <AccountInlineLabel
                account={item.fromAccount}
                placeholder={vm.fromAccountLabel}
                variant="caption"
                showIcon
              />
            </Row>
            <AppIcon name={Icon.ArrowRight} size={Size.xxs} color="textSecondary" />
            <Row flexShrink={1} style={{ minWidth: 0, maxWidth: '46%' }}>
              <AccountInlineLabel
                account={item.toAccount}
                placeholder={vm.toAccountLabel}
                variant="caption"
                showIcon
              />
            </Row>
          </Row>

          <Row justify="space-between" align="center" gap="sm" flexWrap="wrap">
            <Row align="center" gap="sm">
              <Row align="center" gap="xs">
                <AppIcon name={Icon.Repeat} size={Size.iconXs} color="textSecondary" />
                <AppText variant="caption" color="secondary">
                  {vm.intervalSummary}
                </AppText>
              </Row>
              {item.isAutoPost && (
                <View accessible accessibilityRole="image" accessibilityLabel={vm.postingLabel}>
                  <AppIcon name={Icon.Zap} size={Size.iconXs} color="textSecondary" />
                </View>
              )}
            </Row>
            <Row align="center" gap="xs" style={{ flexShrink: 1, marginLeft: 'auto' }}>
              <AppIcon
                name={vm.statusBadge?.icon ?? Icon.Calendar}
                size={Size.iconXs}
                color={dueColor}
              />
              <AppText variant="caption" weight="medium" style={{ color: dueColor, flexShrink: 1 }}>
                {vm.dueSummary}
              </AppText>
            </Row>
          </Row>
        </Column>
      </AppSurface>
    </PressScaleTouchable>
  );
}

export const PlannedPaymentCard = PlannedPaymentCardComponent;
