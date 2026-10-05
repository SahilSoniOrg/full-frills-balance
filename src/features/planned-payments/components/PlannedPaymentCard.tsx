import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { Icon, AppIcon, AppSurface, PressScaleTouchable, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { PlannedPaymentInterval } from '@/src/types/enums';
import {
  formatPlannedPaymentInterval,
  presentPlannedListOccurrenceTiming,
} from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';
import dayjs from 'dayjs';
import { getNow } from '@/src/utils/dateUtils';
import type { PlannedPaymentListOccurrence } from '@/src/services/planned-payment/plannedPaymentReadService';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
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
  const { fontScale } = useWindowDimensions();
  const largeText = fontScale > 1.3;
  const formatMoney = useMoneyFormat({ style: 'compact' });
  const strings = AppConfig.strings.plannedListRedesign;
  const item = occurrence.payment;
  const now = getNow();
  const { isOverdue, isDueSoon } = presentPlannedListOccurrenceTiming(occurrence.date, now);
  const daysLate = isOverdue
    ? Math.abs(dayjs(occurrence.date).startOf('day').diff(dayjs(now).startOf('day'), 'day'))
    : 0;
  const daysLateLabel = isOverdue ? strings.daysLateCompact(daysLate) : undefined;
  const daysLateAccessibility = isOverdue ? strings.daysLate(daysLate) : undefined;
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
      padding="sm"
      radius="r3"
      background="surface"
      borderWidth={1}
      borderColor="surfaceSecondary"
      style={styles.card}
    >
      <View style={styles.cardContent}>
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
            daysLateAccessibility,
          ]
            .filter(Boolean)
            .join('. ')}
          accessibilityHint={strings.rowAccessibilityHint}
          style={styles.rowPress}
          surfaceStyle={styles.rowPressSurface}
        >
          <View
            style={[
              styles.dateBlock,
              largeText && { width: Size.fab },
              { backgroundColor: dateBlockColor },
            ]}
          >
            <AppText variant="caption" weight="semibold" style={{ color: dateTextColor }}>
              {dayjs(occurrence.date).format('ddd')}
            </AppText>
            <AppText variant="heading" weight="bold" style={{ color: dateTextColor }}>
              {dayjs(occurrence.date).format('D')}
            </AppText>
          </View>
          <View style={styles.details}>
            <View style={[styles.nameLine, largeText && styles.nameLineLarge]}>
              <View style={styles.identity}>
                <AppText
                  variant="body"
                  weight="semibold"
                  numberOfLines={largeText ? 2 : 1}
                  style={styles.name}
                >
                  {item.name}
                </AppText>
                {item.isAutoPost && (
                  <AppIcon name={Icon.Zap} size={Size.iconXs} color="textSecondary" />
                )}
              </View>
              <MoneyText
                amount={occurrence.amount}
                currencyCode={occurrence.currencyCode}
                formatStyle="compact"
                prefix={isIncome ? '+' : undefined}
                variant="heading"
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.2}
                weight="bold"
                style={[
                  styles.amount,
                  largeText && styles.amountLarge,
                  { color: isIncome ? theme.income : theme.text },
                ]}
              />
            </View>
            {!isOverdue && (
              <View style={[styles.flow, largeText && styles.flowLarge]}>
                <AccountInlineLabel
                  account={item.fromAccount}
                  placeholder={fromLabel}
                  variant="caption"
                  appearance="transactionFlow"
                  showIcon
                />
                <AppIcon name={Icon.ArrowRight} size={Size.iconXs} color="textSecondary" />
                <AccountInlineLabel
                  account={item.toAccount}
                  placeholder={toLabel}
                  variant="caption"
                  appearance="transactionFlow"
                  showIcon
                />
              </View>
            )}
            {!isOverdue && interval && (
              <View style={styles.metaRow}>
                <AppIcon name={Icon.Repeat} size={Size.iconXs} color="textSecondary" />
                <AppText
                  variant="caption"
                  color="secondary"
                  numberOfLines={1}
                  style={styles.metaText}
                >
                  {interval}
                </AppText>
              </View>
            )}
            {isOverdue && (
              <View style={[styles.overdueMeta, largeText && styles.overdueMetaLarge]}>
                <View style={styles.metaRow}>
                  <AppIcon name={Icon.Clock} size={Size.iconXs} color={theme.error} />
                  <AppText variant="caption" weight="semibold" color="error">
                    {daysLateLabel}
                  </AppText>
                </View>
                {interval && (
                  <View style={styles.metaRow}>
                    <AppIcon name={Icon.Repeat} size={Size.iconXs} color="textSecondary" />
                    <AppText
                      variant="caption"
                      color="secondary"
                      numberOfLines={1}
                      style={styles.metaText}
                    >
                      {interval}
                    </AppText>
                  </View>
                )}
              </View>
            )}
          </View>
        </PressScaleTouchable>
        {isOverdue &&
          (onRecord && canRecord ? (
            <Pressable
              onPress={onRecord}
              disabled={!canRecord || isRecording || isPlanBusy}
              accessibilityRole="button"
              accessibilityLabel={
                isRecording
                  ? strings.recordBusy
                  : strings.recordAccessibility(item.name, amountLabel)
              }
              accessibilityState={{
                disabled: !canRecord || isRecording || isPlanBusy,
                busy: isRecording,
              }}
              style={largeText ? styles.recordButtonLarge : styles.recordButton}
            >
              <View style={[styles.recordPill, { backgroundColor: theme.primary }]}>
                <AppIcon
                  name={Icon.Check}
                  size={Size.iconSm}
                  color={theme.onPrimary ?? theme.text}
                />
              </View>
            </Pressable>
          ) : null)}
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
  cardContent: { gap: Spacing.xs, position: 'relative' },
  rowPress: { flex: 1, minWidth: 0 },
  rowPressSurface: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, minWidth: 0 },
  dateBlock: {
    width: Size.buttonMd,
    minHeight: Size.buttonMd,
    flexShrink: 0,
    borderRadius: Shape.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  details: { flex: 1, minWidth: 0, gap: Spacing.xs },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minWidth: 0 },
  nameLineLarge: { flexDirection: 'column', alignItems: 'flex-start' },
  identity: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: Spacing.xs },
  name: { flexShrink: 1, minWidth: 0 },
  flow: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: Spacing.xs,
    minWidth: 0,
  },
  flowLarge: { flexWrap: 'wrap' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minWidth: 0 },
  metaText: { flexShrink: 1, minWidth: 0 },
  amount: { textAlign: 'right', flexShrink: 0 },
  amountLarge: { textAlign: 'left', alignSelf: 'flex-start' },
  overdueMeta: {
    minHeight: Size.buttonMd,
    paddingRight: Size.buttonMd + Spacing.xl + Spacing.sm,
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  overdueMetaLarge: { paddingRight: 0 },
  recordButton: {
    minHeight: Size.buttonMd,
    minWidth: Size.buttonMd,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: 0,
    bottom: 0,
  },
  recordButtonLarge: {
    minHeight: Size.buttonMd,
    minWidth: Size.buttonMd,
    paddingHorizontal: Spacing.xs,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    right: undefined,
    bottom: undefined,
    alignSelf: 'flex-end',
  },
  recordPill: {
    minHeight: Size.touchTarget,
    minWidth: Size.touchTarget,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordError: { marginTop: Spacing.xs, marginLeft: Size.buttonMd + Spacing.sm },
});
