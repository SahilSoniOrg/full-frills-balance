import { useMoneyFormat } from '@/src/components/shared/moneyFormat';
import { EntryCardLayout } from '@/src/components/journal/EntryCardLayout';
import { JournalAccountFlow } from '@/src/components/journal/JournalAccountFlow';
import { Icon, AppIcon, AppCard, PressScaleTouchable, AppText } from '@/src/components/core';
import { AppConfig, Shape, Size, Spacing } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { PlannedPaymentInterval } from '@/src/types/enums';
import {
  formatPlannedPaymentInterval,
  plannedAccountLeg,
  presentPlannedListOccurrenceTiming,
} from '@/src/features/planned-payments/hooks/plannedPaymentDetailsPresentation';
import dayjs from 'dayjs';
import { getNow } from '@/src/utils/dateUtils';
import type { PlannedPaymentListOccurrence } from '@/src/services/planned-payment/plannedPaymentReadService';
import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';

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
  const showRecord = isOverdue && onRecord != null && canRecord;

  const intervalMeta = interval ? (
    <View style={styles.metaRow}>
      <AppIcon name={Icon.Repeat} size={Size.iconXs} color="textSecondary" />
      <AppText variant="caption" color="secondary" numberOfLines={1} style={styles.metaText}>
        {interval}
      </AppText>
    </View>
  ) : null;

  return (
    <AppCard
      paddingSize="none"
      overflow="visible"
      elevation="sm"
      radius="r2"
      background="surface"
      style={styles.card}
    >
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
      >
        <EntryCardLayout
          leading={
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
          }
          title={item.name}
          titleAccessory={
            item.isAutoPost ? (
              <AppIcon name={Icon.Zap} size={Size.iconXs} color="textSecondary" />
            ) : undefined
          }
          amount={occurrence.amount}
          currencyCode={occurrence.currencyCode}
          amountFormatStyle="compact"
          amountPrefix={isIncome ? '+' : undefined}
          amountColor={isIncome ? theme.income : theme.text}
          footer={
            isOverdue ? (
              <View style={[styles.footer, showRecord && !largeText && styles.footerWithAction]}>
                <View style={styles.metaRow}>
                  <AppIcon name={Icon.Clock} size={Size.iconXs} color={theme.error} />
                  <AppText variant="caption" weight="semibold" color="error">
                    {daysLateLabel}
                  </AppText>
                </View>
                {intervalMeta}
              </View>
            ) : (
              <JournalAccountFlow
                accountFlow={{
                  sources: [plannedAccountLeg(item.fromAccount, 'SOURCE', fromLabel)],
                  destinations: [plannedAccountLeg(item.toAccount, 'DESTINATION', toLabel)],
                  neutral: [],
                  showCurrencyCodes: false,
                }}
                trailing={intervalMeta ?? undefined}
              />
            )
          }
        />
      </PressScaleTouchable>
      {showRecord && (
        <Pressable
          onPress={onRecord}
          disabled={isRecording || isPlanBusy}
          accessibilityRole="button"
          accessibilityLabel={
            isRecording ? strings.recordBusy : strings.recordAccessibility(item.name, amountLabel)
          }
          accessibilityState={{ disabled: isRecording || isPlanBusy, busy: isRecording }}
          style={largeText ? styles.recordButtonLarge : styles.recordButton}
        >
          <View style={[styles.recordPill, { backgroundColor: theme.primary }]}>
            <AppIcon name={Icon.Check} size={Size.iconSm} color={theme.onPrimary ?? theme.text} />
          </View>
        </Pressable>
      )}
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
    </AppCard>
  );
}

export const PlannedPaymentCard = PlannedPaymentCardComponent;

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.lg },
  dateBlock: {
    width: Size.buttonMd,
    minHeight: Size.buttonMd,
    flexShrink: 0,
    borderRadius: Shape.radius.md,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xs,
  },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: Spacing.sm,
    rowGap: Spacing.xs,
  },
  footerWithAction: { minHeight: Size.buttonMd, paddingRight: Size.buttonMd + Spacing.sm },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.xs, minWidth: 0 },
  metaText: { flexShrink: 1, minWidth: 0 },
  recordButton: {
    minHeight: Size.buttonMd,
    minWidth: Size.buttonMd,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    right: Spacing.md,
    bottom: Spacing.lg,
  },
  recordButtonLarge: {
    minHeight: Size.buttonMd,
    minWidth: Size.buttonMd,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginRight: Spacing.md,
    marginBottom: Spacing.lg,
  },
  recordPill: {
    minHeight: Size.touchTarget,
    minWidth: Size.touchTarget,
    borderRadius: Shape.radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordError: {
    marginTop: -Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.lg,
  },
});
