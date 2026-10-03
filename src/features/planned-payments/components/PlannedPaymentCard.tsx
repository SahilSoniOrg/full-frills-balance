import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Icon, AppIcon, AppSurface, PressScaleTouchable, AppText } from '@/src/components/core';
import { AppConfig, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { PlannedPaymentInterval } from '@/src/types/enums';
import { formatPlannedPaymentInterval } from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';
import dayjs from 'dayjs';
import type { PlannedPaymentListOccurrence } from '@/src/services/planned-payment/plannedPaymentReadService';
import { Pressable, StyleSheet, View } from 'react-native';
import { AccountInlineLabel } from '@/src/components/accounts/AccountInlineLabel';

export interface PlannedPaymentCardProps {
  occurrence: PlannedPaymentListOccurrence;
  onPress: () => void;
  onRecord?: () => void;
  canRecord?: boolean;
  isRecording?: boolean;
  isPlanBusy?: boolean;
  recordError?: string;
}

function PlannedPaymentCardComponent({
  occurrence,
  onPress,
  onRecord,
  canRecord = occurrence.canRecord,
  isRecording = false,
  isPlanBusy = false,
  recordError,
}: PlannedPaymentCardProps) {
  const { theme } = useTheme();
  const formatMoney = useMoneyFormat();
  const strings = AppConfig.strings.plannedListRedesign;
  const item = occurrence.payment;
  const isOverdue = dayjs(occurrence.date).startOf('day').isBefore(dayjs().startOf('day'));
  const daysLate = isOverdue
    ? dayjs().startOf('day').diff(dayjs(occurrence.date).startOf('day'), 'day')
    : 0;
  const isDueSoon =
    !isOverdue && dayjs(occurrence.date).startOf('day').diff(dayjs().startOf('day'), 'day') <= 3;
  const interval =
    item.intervalType === PlannedPaymentInterval.MONTHLY && item.intervalN === 1
      ? undefined
      : formatPlannedPaymentInterval(item);
  const amountLabel = formatMoney(occurrence.amount, occurrence.currencyCode);
  const isIncome = item.flowDirection === 'inflow';
  const fromLabel = item.fromAccount?.name ?? strings.noAccount;
  const toLabel = item.toAccount?.name ?? strings.noAccount;
  const dateBlockColor = isOverdue
    ? theme.errorLight
    : isDueSoon
      ? theme.warningLight
      : theme.surfaceSecondary;
  const dateTextColor = isOverdue ? theme.error : isDueSoon ? theme.warning : theme.textSecondary;

  return (
    <AppSurface
      elevation="sm"
      padding="md"
      radius="r3"
      background="surface"
      borderWidth={1}
      borderColor="surfaceSecondary"
      style={styles.card}
    >
      <View style={styles.cardRow}>
        <PressScaleTouchable
          onPress={onPress}
          accessibilityRole="button"
          accessibilityLabel={[
            item.name,
            isIncome
              ? strings.incomeRow
              : item.flowDirection === 'transfer'
                ? strings.transferRow
                : strings.outgoingRow,
            amountLabel,
            strings.dueDateAccessibility(dayjs(occurrence.date).format('dddd, MMMM D')),
            strings.fromTo(fromLabel, toLabel),
            item.isAutoPost ? strings.autoPost : undefined,
            interval,
            isOverdue ? strings.daysLate(daysLate) : undefined,
          ]
            .filter(Boolean)
            .join('. ')}
          accessibilityHint={strings.rowAccessibilityHint}
          style={styles.rowPress}
          surfaceStyle={styles.rowPressSurface}
        >
          <View style={[styles.dateBlock, { backgroundColor: dateBlockColor }]}>
            <AppText variant="caption" weight="semibold" style={{ color: dateTextColor }}>
              {dayjs(occurrence.date).format('ddd')}
            </AppText>
            <AppText variant="heading" weight="bold" style={{ color: dateTextColor }}>
              {dayjs(occurrence.date).format('D')}
            </AppText>
          </View>
          <View style={styles.details}>
            <View style={styles.nameLine}>
              <AppText variant="body" weight="semibold" style={styles.name}>
                {item.name}
              </AppText>
              {item.isAutoPost && (
                <AppIcon name={Icon.Zap} size={Size.iconXs} color="textSecondary" />
              )}
            </View>
            {isOverdue ? (
              <AppText variant="caption" weight="semibold" color="error">
                {strings.daysLate(daysLate)}
              </AppText>
            ) : (
              <View style={styles.flow}>
                <AccountInlineLabel
                  account={item.fromAccount}
                  placeholder={fromLabel}
                  variant="caption"
                />
                <AppIcon name={Icon.ArrowRight} size={Size.xxs} color="textSecondary" />
                <AccountInlineLabel
                  account={item.toAccount}
                  placeholder={toLabel}
                  variant="caption"
                />
              </View>
            )}
            {interval && (
              <AppText variant="caption" color="secondary">
                {interval}
              </AppText>
            )}
          </View>
        </PressScaleTouchable>
        <View style={styles.amountColumn}>
          <MoneyText
            amount={occurrence.amount}
            currencyCode={occurrence.currencyCode}
            prefix={isIncome ? '+' : undefined}
            variant="heading"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.2}
            weight="bold"
            style={[styles.amount, { color: isIncome ? theme.income : theme.text }]}
          />
          {isOverdue && onRecord && canRecord && (
            <Pressable
              onPress={onRecord}
              disabled={!canRecord || isRecording || isPlanBusy}
              accessibilityRole="button"
              accessibilityLabel={strings.recordAccessibility(item.name, amountLabel)}
              accessibilityState={{
                disabled: !canRecord || isRecording || isPlanBusy,
                busy: isRecording,
              }}
              style={[styles.recordButton, { backgroundColor: theme.primary }]}
            >
              {isRecording ? (
                <AppText
                  variant="caption"
                  weight="semibold"
                  style={{ color: theme.onPrimary ?? theme.text }}
                >
                  {strings.recordBusy}
                </AppText>
              ) : (
                <AppText
                  variant="bodySmall"
                  weight="semibold"
                  style={{ color: theme.onPrimary ?? theme.text }}
                >
                  {strings.record}
                </AppText>
              )}
            </Pressable>
          )}
        </View>
      </View>
      {recordError && (
        <AppText
          variant="caption"
          color="error"
          accessibilityRole="alert"
          style={styles.recordError}
        >
          {recordError}
        </AppText>
      )}
    </AppSurface>
  );
}

export const PlannedPaymentCard = PlannedPaymentCardComponent;

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.sm },
  cardRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.sm },
  rowPress: { flexGrow: 1, flexShrink: 1, flexBasis: 190, minWidth: 180 },
  rowPressSurface: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md, minWidth: 0 },
  dateBlock: {
    width: 54,
    minHeight: 56,
    flexShrink: 0,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  details: { flex: 1, minWidth: 0, gap: Spacing.xs },
  nameLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: Spacing.xs },
  name: { flexShrink: 1 },
  flow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 0,
  },
  amountColumn: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 112,
    minWidth: 0,
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  amount: { textAlign: 'right', flexShrink: 1, alignSelf: 'stretch' },
  recordButton: {
    minHeight: 44,
    minWidth: 88,
    paddingHorizontal: Spacing.md,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordError: { marginTop: Spacing.sm, marginLeft: 54 + Spacing.md },
});
