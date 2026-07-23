import { LineChart } from '@/src/components/charts/LineChart';
import { DateRangeTrigger } from '@/src/components/common/DateRangeTrigger';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppCard, AppText, Badge, IvyIcon } from '@/src/components/core';
import { Shape, Size, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { getAccountFallbackIcon } from '@/src/features/accounts/utils/getAccountIcon';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { DateRange, formatRelativeReconciledDate, formatShortDate } from '@/src/utils/dateUtils';
import dayjs from 'dayjs';
import { Pressable, StyleSheet, View } from 'react-native';

interface AccountDetailsHeaderProps {
  accountName: string;
  accountIcon: string | null;
  accountType: string;
  accountSubtypeLabel: string;
  accountTypeVariant: string;
  accountTypeColorKey: string;
  isParent: boolean;
  isDeleted: boolean;
  subAccountCount: number;
  onShowSubAccounts: () => void;
  balanceText: string;
  currencyCode: string;
  secondaryBalances: { amountText: string }[];
  transactionCountText: string;
  reconciledAt: Date | null;
  dateRange: DateRange | null;
  onShowDatePicker: () => void;
  onPreviousPeriod?: () => void;
  onNextPeriod?: () => void;
  chartData: { x: number; y: number }[];
  rollingAverageData: { x: number; y: number }[];
  xTicks: number[];
  periodMetricsFormatted: {
    totalIncreaseText: string;
    totalDecreaseText: string;
    dailyAverageText: string | null;
    isLoading: boolean;
  };
}

export function AccountDetailsHeader({
  accountName,
  accountIcon,
  accountType,
  accountSubtypeLabel,
  accountTypeVariant,
  accountTypeColorKey,
  isParent,
  isDeleted,
  subAccountCount,
  onShowSubAccounts,
  balanceText,
  secondaryBalances,
  transactionCountText,
  reconciledAt,
  dateRange,
  onShowDatePicker,
  onPreviousPeriod,
  onNextPeriod,
  chartData,
  rollingAverageData,
  xTicks,
  periodMetricsFormatted,
  currencyCode,
}: AccountDetailsHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.headerListRegion}>
      <AppCard elevation="sm" style={styles.accountInfoCard}>
        <View style={styles.accountHeader}>
          <IvyIcon
            name={accountIcon || undefined}
            fallbackIcon={getAccountFallbackIcon(accountType)}
            label={accountName}
            color={theme[accountTypeColorKey as keyof typeof theme] as string}
            size={Size.avatarMd}
            shape={isParent ? 'square' : 'circle'}
          />
          <View style={styles.titleInfo}>
            <AppText variant="title">{accountName}</AppText>
            <View style={styles.badgesRow}>
              <Badge variant={accountTypeVariant as any}>{accountType}</Badge>
              {accountSubtypeLabel ? (
                <Badge variant={accountTypeVariant as any}>{accountSubtypeLabel}</Badge>
              ) : null}
              {isParent ? (
                <Pressable
                  onPress={onShowSubAccounts}
                  style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                >
                  <Badge variant={accountTypeVariant as any} icon="hierarchy">
                    {subAccountCount} {subAccountCount === 1 ? 'SUB-ACCOUNT' : 'SUB-ACCOUNTS'}
                  </Badge>
                </Pressable>
              ) : null}
              {isDeleted ? <Badge variant="expense">DELETED</Badge> : null}
              {reconciledAt ? (
                <Badge variant="success" icon="shieldCheck">
                  {formatRelativeReconciledDate(reconciledAt)}
                </Badge>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.accountStats}>
          <View style={styles.statItem}>
            <AppText variant="caption" color="secondary">
              Current Balance
            </AppText>
            <AppText variant="heading">{balanceText}</AppText>
            {secondaryBalances.length > 0 ? (
              <View style={styles.secondaryBalances}>
                {secondaryBalances.map((balance, index) => (
                  <AppText key={index} variant="caption" color="secondary">
                    + {balance.amountText}
                  </AppText>
                ))}
              </View>
            ) : null}
          </View>

          <View style={styles.statItem}>
            <AppText variant="caption" color="secondary">
              Transactions
            </AppText>
            <AppText variant="subheading">{transactionCountText}</AppText>
          </View>
        </View>
      </AppCard>

      <ScreenSectionHeader
        title="Activity"
        style={styles.sectionHeader}
        action={
          <DateRangeTrigger
            range={dateRange}
            onPress={onShowDatePicker}
            onPrevious={onPreviousPeriod}
            onNext={onNextPeriod}
          />
        }
      />

      {chartData.length > 0 ? (
        <LineChart
          data={chartData}
          currencyCode={currencyCode}
          secondaryData={rollingAverageData}
          secondaryColor={theme.warning}
          xTicks={xTicks}
          formatXTick={formatShortDate}
          avoidPointVertical={true}
          renderTooltipContent={index => {
            const point = chartData[index];
            const rollingPoint = rollingAverageData[index];
            const startPoint = chartData[0];

            if (!point || !startPoint) return null;

            const changeFromStart = point.y - startPoint.y;
            const isPositive = changeFromStart >= 0;

            return (
              <View style={{ width: '100%' }}>
                <AppText
                  variant="caption"
                  color="secondary"
                  style={{ marginBottom: REPORT_CHART_LAYOUT.tooltipDateMarginBottom }}
                >
                  {dayjs(point.x).format('MMM D, YYYY')}
                </AppText>
                <View style={styles.tooltipRow}>
                  <AppText variant="caption" color="secondary">
                    Balance
                  </AppText>
                  <AppText variant="body" weight="bold">
                    {CurrencyFormatter.format(point.y, currencyCode)}
                  </AppText>
                </View>
                <View style={[styles.tooltipRow, { marginTop: 2 }]}>
                  <AppText variant="caption" color="secondary">
                    Change
                  </AppText>
                  <AppText
                    variant="body"
                    weight="bold"
                    style={{ color: isPositive ? theme.income : theme.expense }}
                  >
                    {isPositive ? '+' : ''}
                    {CurrencyFormatter.format(changeFromStart, currencyCode)}
                  </AppText>
                </View>
                {rollingPoint && (
                  <View style={[styles.tooltipRow, { marginTop: 2 }]}>
                    <AppText variant="caption" color="secondary">
                      7d Avg
                    </AppText>
                    <AppText variant="body" weight="bold" style={{ color: theme.warning }}>
                      {CurrencyFormatter.format(rollingPoint.y, currencyCode)}
                    </AppText>
                  </View>
                )}
              </View>
            );
          }}
        />
      ) : null}

      <View style={styles.metricsContainer}>
        <View style={styles.metricItem}>
          <AppText variant="caption" color="secondary">
            {accountType === 'ASSET'
              ? 'Total In'
              : accountType === 'LIABILITY' || accountType === 'CREDIT_CARD'
                ? 'Total Spent'
                : 'Total In'}
          </AppText>
          <AppText variant="heading" color="income">
            {periodMetricsFormatted.isLoading ? '...' : periodMetricsFormatted.totalIncreaseText}
          </AppText>
        </View>
        <View style={styles.metricItem}>
          <AppText variant="caption" color="secondary">
            {accountType === 'ASSET'
              ? 'Total Out'
              : accountType === 'LIABILITY' || accountType === 'CREDIT_CARD'
                ? 'Total Paid'
                : 'Total Out'}
          </AppText>
          <AppText variant="heading" color="expense">
            {periodMetricsFormatted.isLoading ? '...' : periodMetricsFormatted.totalDecreaseText}
          </AppText>
        </View>
        {periodMetricsFormatted.dailyAverageText ? (
          <View style={styles.metricItem}>
            <AppText variant="caption" color="secondary">
              Daily Avg
            </AppText>
            <AppText
              variant="heading"
              color={periodMetricsFormatted.dailyAverageText.startsWith('-') ? 'expense' : 'income'}
            >
              {periodMetricsFormatted.isLoading ? '...' : periodMetricsFormatted.dailyAverageText}
            </AppText>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerListRegion: {
    paddingVertical: Spacing.md,
  },
  accountInfoCard: {
    marginBottom: Spacing.lg,
    padding: Spacing.lg,
    borderRadius: Shape.radius.xl,
  },
  accountHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  titleInfo: {
    marginLeft: Spacing.md,
    flex: 1,
    gap: Spacing.xs,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.xs,
    rowGap: Spacing.xs,
    alignItems: 'center',
  },
  accountStats: {
    flexDirection: 'row',
    gap: Spacing.xl,
    marginBottom: Spacing.md,
    paddingVertical: Spacing.md,
  },
  statItem: {
    flex: 1,
  },
  secondaryBalances: {
    marginTop: Spacing.xs,
    gap: 2,
  },
  sectionHeader: {
    marginBottom: Spacing.sm,
  },
  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: Spacing.xl,
    marginBottom: Spacing.md,
    paddingHorizontal: Spacing.md,
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.xs,
  },
  tooltipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
});
