import { MoneyText } from '@/src/components/common/MoneyText';
import { LineChart } from '@/src/components/charts/LineChart';
import { DateRangeTrigger } from '@/src/components/common/DateRangeTrigger';
import { ScreenSectionHeader } from '@/src/components/common/ScreenSectionHeader';
import { AppCard, AppText, Badge, IvyIcon } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing } from '@/src/constants';
import { REPORT_CHART_LAYOUT } from '@/src/constants/report-constants';
import { getAccountFallbackIcon } from '@/src/features/accounts/utils/getAccountIcon';
import { useTheme } from '@/src/hooks/use-theme';
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
  isArchived: boolean;
  subAccountCount: number;
  onShowSubAccounts: () => void;
  balanceAmount: number | null;
  currencyCode: string;
  secondaryBalances: { currencyCode: string; amount: number }[];
  transactionCountText: string;
  reconciledAt: Date | null;
  dateRange: DateRange | null;
  onShowDatePicker: () => void;
  onPreviousPeriod?: () => void;
  onNextPeriod?: () => void;
  chartData: { x: number; y: number }[];
  rollingAverageData: { x: number; y: number }[];
  xTicks: number[];
  periodMetrics: {
    totalIncrease: number;
    totalDecrease: number;
    dailyAverage: number | null;
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
  isArchived,
  subAccountCount,
  onShowSubAccounts,
  balanceAmount,
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
  periodMetrics,
  currencyCode,
}: AccountDetailsHeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.headerListRegion}>
      <AppCard elevation="sm" style={[styles.accountInfoCard, isArchived && styles.archivedCard]}>
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
              {isArchived ? (
                <Badge variant="default" icon="archive">
                  {AppConfig.strings.accounts.archive.archivedBadge}
                </Badge>
              ) : null}
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
            <MoneyText
              amount={balanceAmount ?? 0}
              currencyCode={currencyCode}
              variant="heading"
              loading={balanceAmount === null}
            />
            {secondaryBalances.length > 0 ? (
              <View style={styles.secondaryBalances}>
                {secondaryBalances.map((balance, index) => (
                  <MoneyText
                    key={index}
                    amount={balance.amount}
                    currencyCode={balance.currencyCode}
                    prefix="+ "
                    variant="caption"
                    color="secondary"
                  />
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
                  <MoneyText
                    amount={point.y}
                    currencyCode={currencyCode}
                    variant="body"
                    weight="bold"
                  />
                </View>
                <View style={[styles.tooltipRow, { marginTop: 2 }]}>
                  <AppText variant="caption" color="secondary">
                    Change
                  </AppText>
                  <MoneyText
                    amount={changeFromStart}
                    currencyCode={currencyCode}
                    prefix={isPositive ? '+' : undefined}
                    variant="body"
                    weight="bold"
                    style={{ color: isPositive ? theme.income : theme.expense }}
                  />
                </View>
                {rollingPoint && (
                  <View style={[styles.tooltipRow, { marginTop: 2 }]}>
                    <AppText variant="caption" color="secondary">
                      7d Avg
                    </AppText>
                    <MoneyText
                      amount={rollingPoint.y}
                      currencyCode={currencyCode}
                      variant="body"
                      weight="bold"
                      style={{ color: theme.warning }}
                    />
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
          <MoneyText
            amount={periodMetrics.totalIncrease}
            currencyCode={currencyCode}
            variant="heading"
            color="income"
            loading={periodMetrics.isLoading}
          />
        </View>
        <View style={styles.metricItem}>
          <AppText variant="caption" color="secondary">
            {accountType === 'ASSET'
              ? 'Total Out'
              : accountType === 'LIABILITY' || accountType === 'CREDIT_CARD'
                ? 'Total Paid'
                : 'Total Out'}
          </AppText>
          <MoneyText
            amount={periodMetrics.totalDecrease}
            currencyCode={currencyCode}
            variant="heading"
            color="expense"
            loading={periodMetrics.isLoading}
          />
        </View>
        {periodMetrics.dailyAverage !== null ? (
          <View style={styles.metricItem}>
            <AppText variant="caption" color="secondary">
              Daily Avg
            </AppText>
            <MoneyText
              amount={periodMetrics.dailyAverage}
              currencyCode={currencyCode}
              variant="heading"
              color={periodMetrics.dailyAverage < 0 ? 'expense' : 'income'}
              loading={periodMetrics.isLoading}
            />
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
  archivedCard: {
    opacity: Opacity.medium,
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
