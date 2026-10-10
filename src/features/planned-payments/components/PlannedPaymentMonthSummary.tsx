import { AppCard, AppText } from '@/src/components/core';
import { MoneyText } from '@/src/components/shared/MoneyText';
import { AppConfig, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import type { PlannedPaymentListPresentation } from '@/src/features/planned-payments/hooks/plannedPaymentListPresentation';
import dayjs from 'dayjs';
import { StyleSheet, View } from 'react-native';

type SummaryProps = { listData: PlannedPaymentListPresentation };

export function PlannedPaymentMonthSummary({ listData }: SummaryProps) {
  const { theme } = useTheme();
  const strings = AppConfig.strings.plannedListRedesign;
  const monthName = dayjs(listData.monthStart).format('MMMM');
  const outgoing = listData.summary.outgoing;
  const incoming = listData.summary.incoming;
  return (
    <AppCard
      overflow="visible"
      elevation="sm"
      padding="md"
      radius="r3"
      background="surface"
      borderWidth={1}
      borderColor="surfaceSecondary"
      style={styles.card}
    >
      <View style={styles.summaryTop}>
        <AppText variant="body" weight="semibold" style={styles.summaryLabel}>
          {strings.summaryTitle(monthName)}
        </AppText>
        {incoming.count > 0 && (
          <View style={styles.incoming}>
            <MoneyText
              amount={incoming.mainCurrency.amount}
              currencyCode={incoming.mainCurrency.currencyCode}
              formatStyle="compact"
              prefix="+"
              variant="heading"
              fit={{
                maxFontSize: Typography.roles.heading.fontSize,
                minFontSize: Typography.sizes.xs,
                lineHeightRatio:
                  Typography.roles.heading.lineHeight / Typography.roles.heading.fontSize,
                hug: true,
              }}
              weight="semibold"
              color="income"
            />
            <AppText variant="caption" color="income" weight="medium">
              {strings.comingInCount(incoming.count)}
            </AppText>
            {incoming.otherCurrencyCount > 0 && (
              <AppText variant="caption" color="income">
                {strings.otherCurrencies(incoming.otherCurrencyCount)}
              </AppText>
            )}
          </View>
        )}
      </View>
      <View style={styles.totalLine}>
        <MoneyText
          amount={outgoing.mainCurrency.amount}
          currencyCode={outgoing.mainCurrency.currencyCode}
          formatStyle="compact"
          variant="title"
          fit={{
            maxFontSize: Typography.roles.title.fontSize,
            minFontSize: Typography.sizes.xl,
            lineHeightRatio: Typography.roles.title.lineHeight / Typography.roles.title.fontSize,
            hug: true,
          }}
          style={{ color: theme.text }}
          weight="bold"
        />
        <AppText variant="caption" color="secondary">
          {strings.paymentCount(outgoing.count)}
        </AppText>
      </View>
      {outgoing.otherCurrencyCount > 0 && (
        <AppText variant="caption" color="secondary" style={styles.otherCurrencies}>
          {strings.otherCurrencies(outgoing.otherCurrencyCount)}
        </AppText>
      )}
      {listData.summary.unknownCount > 0 && (
        <AppText variant="caption" color="secondary">
          {strings.unclassified(listData.summary.unknownCount)}
        </AppText>
      )}
      <PlannedPaymentMonthStrip listData={listData} monthName={monthName} />
    </AppCard>
  );
}

type MonthStripProps = {
  listData: PlannedPaymentListPresentation;
  monthName: string;
};

export function PlannedPaymentMonthStrip({ listData, monthName }: MonthStripProps) {
  const { theme } = useTheme();
  const strings = AppConfig.strings.plannedListRedesign;
  const largestOutgoing = Math.max(0, ...listData.monthStrip.map(day => day.outgoingAmount));
  const largestIncoming = Math.max(0, ...listData.monthStrip.map(day => day.incomingAmount));
  const count = listData.summary.outgoing.count;
  const largestDay = listData.monthStrip
    .filter(day => !day.isPast)
    .reduce<(typeof listData.monthStrip)[number] | undefined>((largest, day) => {
      const value = day.outgoingAmount + day.incomingAmount;
      const largestValue = largest ? largest.outgoingAmount + largest.incomingAmount : 0;
      return value > largestValue ? day : largest;
    }, undefined);
  const largestDayLabel = largestDay
    ? dayjs(largestDay.date).format(
        dayjs(largestDay.date).isSame(listData.monthStart, 'year') ? 'MMM D' : 'MMM D, YYYY',
      )
    : undefined;
  const accessibilityLabel = strings.monthStripAccessibility(monthName, count, largestDayLabel);

  return (
    <View
      style={styles.stripWrap}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View
        style={styles.strip}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {listData.monthStrip.map(day => {
          const outgoingBucket = bucketFor(day.outgoingAmount, largestOutgoing);
          const incomingBucket = bucketFor(day.incomingAmount, largestIncoming);
          const pastOpacity = day.isPast ? 0.38 : 1;
          return (
            <View
              key={day.day}
              style={[
                styles.dayCell,
                { opacity: pastOpacity },
                day.isToday && { backgroundColor: theme.surfaceSecondary, borderRadius: 3 },
              ]}
              importantForAccessibility="no"
            >
              <View style={styles.dayBars}>
                {day.outgoingAmount > 0 && (
                  <View
                    style={{
                      height: bucketHeight(outgoingBucket),
                      borderRadius: 2,
                      backgroundColor: theme.error,
                    }}
                  />
                )}
                {day.incomingAmount > 0 && (
                  <View
                    style={{
                      height: bucketHeight(incomingBucket),
                      borderRadius: 2,
                      backgroundColor: theme.income,
                    }}
                  />
                )}
              </View>
              {day.isToday && (
                <View style={[styles.todayMarker, { backgroundColor: theme.text }]} />
              )}
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        <AppText variant="caption" color="secondary">
          {dayjs(listData.monthStart).format('MMM D')}
        </AppText>
        <AppText variant="caption" color="secondary">
          {strings.today}
        </AppText>
        <AppText variant="caption" color="secondary">
          {dayjs(listData.nextMonthStart - 1).format('MMM D')}
        </AppText>
      </View>
    </View>
  );
}

function bucketFor(amount: number, largest: number) {
  if (amount <= 0 || largest <= 0) return 0;
  return amount < largest / 3 ? 1 : amount < (largest * 2) / 3 ? 2 : 3;
}

function bucketHeight(bucket: number) {
  return bucket === 1 ? 6 : bucket === 2 ? 9 : bucket === 3 ? 12 : 0;
}

const styles = StyleSheet.create({
  card: { marginBottom: Spacing.sm },
  summaryTop: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  summaryLabel: { flexShrink: 1 },
  incoming: { alignItems: 'flex-end', flexShrink: 1 },
  totalLine: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  otherCurrencies: { marginTop: Spacing.xs },
  stripWrap: { marginTop: Spacing.sm },
  strip: { height: 30, flexDirection: 'row', alignItems: 'flex-end', gap: 2 },
  dayCell: {
    flex: 1,
    height: 30,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 2,
  },
  dayBars: { width: '70%', justifyContent: 'flex-end', gap: 1 },
  todayMarker: { position: 'absolute', bottom: 0, width: 2, height: 28, borderRadius: 2 },
  axis: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
});
