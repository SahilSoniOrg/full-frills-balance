import { LineChart } from '@/src/components/charts/LineChart';
import { DateRangeFilter } from '@/src/components/common/DateRangeFilter';
import { DateRangePicker } from '@/src/components/common/DateRangePicker';
import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { TransactionListView } from '@/src/components/common/TransactionListView';
import { AppButton, AppCard, AppText, Badge, FloatingActionButton, IvyIcon } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Shape, Size, Spacing } from '@/src/constants';
import { SubAccountListModal } from '@/src/features/accounts/components/SubAccountListModal';
import { AccountDetailsViewModel } from '@/src/features/accounts/hooks/useAccountDetailsViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import { formatShortDate } from '@/src/utils/dateUtils';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

export function AccountDetailsView(vm: AccountDetailsViewModel) {
    const { theme } = useTheme();
    const {
        accountLoading,
        accountMissing,
        accountName,
        accountType,
        accountSubcategoryLabel,
        accountTypeVariant,
        accountIcon,
        accountTypeColorKey,
        isDeleted,
        balanceText,
        transactionCountText,
        headerActions,
        onBack,
        onAuditPress,
        onAddPress,
        showFab,
        dateRange,
        periodFilter,
        isDatePickerVisible,
        showDatePicker,
        hideDatePicker,
        navigatePrevious,
        navigateNext,
        onDateSelect,
        chartData,
        rollingAverageData,
        xTicks,
        periodMetricsFormatted,
        transactionsLoading,
        transactionsLoadingMore,
        transactionItems,
        onLoadMore,
        secondaryBalances,
        isParent,
        subAccountCount,
        subAccounts,
        subAccountsLoading,
        isSubAccountsModalVisible,
        onShowSubAccounts,
        onHideSubAccounts,
    } = vm;

    if (accountLoading) {
        return (
            <Screen title="Details">
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.primary} />
                </View>
            </Screen>
        );
    }

    if (accountMissing) {
        return (
            <Screen title="Details">
                <View style={styles.errorContainer}>
                    <AppText variant="body" color="error">
                        Account not found
                    </AppText>
                    <AppButton variant="outline" onPress={onBack}>
                        Go Back
                    </AppButton>
                </View>
            </Screen>
        );
    }

    const headerActionsNode = (
        <ScreenHeaderActions
            actions={
                headerActions.canRecover
                    ? [
                        {
                            name: 'history',
                            onPress: onAuditPress,
                            variant: 'surface',
                            iconColor: theme.textSecondary,
                        },
                        {
                            name: 'refresh',
                            onPress: headerActions.onRecover,
                            variant: 'surface',
                            iconColor: theme.income,
                        },
                    ]
                    : [
                        {
                            name: 'history',
                            onPress: onAuditPress,
                            variant: 'surface',
                            iconColor: theme.textSecondary,
                        },
                        {
                            name: 'edit',
                            onPress: headerActions.onEdit,
                            variant: 'surface',
                            iconColor: theme.text,
                            testID: 'edit-button',
                        },
                        {
                            name: 'delete',
                            onPress: headerActions.onDelete,
                            variant: 'surface',
                            iconColor: theme.error,
                            testID: 'delete-button',
                        },
                    ]
            }
        />
    );

    return (
        <Screen
            title={isParent ? 'Group Account' : 'Account Details'}
            headerActions={headerActionsNode}
        >
            <TransactionListView
                items={transactionItems}
                isLoading={transactionsLoading}
                isLoadingMore={transactionsLoadingMore}
                onEndReached={onLoadMore}
                emptyTitle="No transactions yet"
                emptySubtitle="Transactions for this account will appear here."
                ListHeaderComponent={
                    <View style={styles.headerListRegion}>
                        <AppCard elevation="sm" style={styles.accountInfoCard}>
                            <View style={styles.accountHeader}>
                                <IvyIcon
                                    name={accountIcon as any}
                                    label={accountName}
                                    color={theme[accountTypeColorKey as keyof typeof theme] as string}
                                    size={Size.avatarMd}
                                    shape={isParent ? 'square' : 'circle'}
                                />
                                <View style={styles.titleInfo}>
                                    <AppText variant="title">
                                        {accountName}
                                    </AppText>
                                    <View style={{ flexDirection: 'row', gap: Spacing.xs, alignItems: 'center' }}>
                                        <Badge variant={accountTypeVariant as any}>
                                            {accountType}
                                        </Badge>
                                        {accountSubcategoryLabel ? (
                                            <Badge variant={accountTypeVariant as any}>
                                                {accountSubcategoryLabel}
                                            </Badge>
                                        ) : null}
                                        {isParent && (
                                            <Pressable
                                                onPress={onShowSubAccounts}
                                                style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
                                            >
                                                <Badge variant={accountTypeVariant as any} icon="hierarchy">
                                                    {subAccountCount} {subAccountCount === 1 ? 'SUB-ACCOUNT' : 'SUB-ACCOUNTS'}
                                                </Badge>
                                            </Pressable>
                                        )}
                                        {isDeleted && (
                                            <Badge variant="expense">
                                                DELETED
                                            </Badge>
                                        )}
                                    </View>
                                </View>
                            </View>

                            <View style={styles.accountStats}>
                                <View style={styles.statItem}>
                                    <AppText variant="caption" color="secondary">
                                        Current Balance
                                    </AppText>
                                    <AppText variant="heading">
                                        {balanceText}
                                    </AppText>
                                    {secondaryBalances.length > 0 && (
                                        <View style={styles.secondaryBalances}>
                                            {secondaryBalances.map((sb, idx) => (
                                                <AppText key={idx} variant="caption" color="secondary">
                                                    + {sb.amountText}
                                                </AppText>
                                            ))}
                                        </View>
                                    )}
                                </View>

                                <View style={styles.statItem}>
                                    <AppText variant="caption" color="secondary">
                                        Transactions
                                    </AppText>
                                    <AppText variant="subheading">
                                        {transactionCountText}
                                    </AppText>
                                </View>
                            </View>
                        </AppCard>

                        <View style={styles.sectionHeader}>
                            <DateRangeFilter
                                fullWidth
                                range={dateRange}
                                onPress={showDatePicker}
                                onPrevious={navigatePrevious}
                                onNext={navigateNext}
                            />
                        </View>

                        {chartData.length > 0 && (
                            <View style={styles.chartContainer}>
                                <AppText>Chart has {chartData.length} entries</AppText>
                                <LineChart
                                    data={chartData}
                                    secondaryData={rollingAverageData}
                                    secondaryColor={theme.warning}
                                    xTicks={xTicks}
                                    formatXTick={formatShortDate}
                                    height={180}
                                />
                            </View>
                        )}

                        <View style={styles.metricsContainer}>
                            <View style={styles.metricItem}>
                                <AppText variant="caption" color="secondary">
                                    {accountType === 'ASSET' ? 'Total In' :
                                        (accountType === 'LIABILITY' || accountType === 'CREDIT_CARD' ? 'Total Spent' : 'Total In')}
                                </AppText>
                                <AppText variant="heading" color="income">
                                    {periodMetricsFormatted.isLoading ? '...' : periodMetricsFormatted.totalIncreaseText}
                                </AppText>
                            </View>
                            <View style={styles.metricItem}>
                                <AppText variant="caption" color="secondary">
                                    {accountType === 'ASSET' ? 'Total Out' :
                                        (accountType === 'LIABILITY' || accountType === 'CREDIT_CARD' ? 'Total Paid' : 'Total Out')}
                                </AppText>
                                <AppText variant="heading" color="expense">
                                    {periodMetricsFormatted.isLoading ? '...' : periodMetricsFormatted.totalDecreaseText}
                                </AppText>
                            </View>
                            {periodMetricsFormatted.dailyAverageText && (
                                <View style={styles.metricItem}>
                                    <AppText variant="caption" color="secondary">Daily Avg</AppText>
                                    <AppText variant="heading" color={periodMetricsFormatted.dailyAverageText.startsWith('-') ? 'expense' : 'income'}>
                                        {periodMetricsFormatted.isLoading ? '...' : periodMetricsFormatted.dailyAverageText}
                                    </AppText>
                                </View>
                            )}
                        </View>
                    </View>
                }
                contentContainerStyle={styles.listContainer}
                estimatedItemSize={120}
            />

            {showFab && (
                <FloatingActionButton
                    onPress={onAddPress}
                />
            )}

            <DateRangePicker
                visible={isDatePickerVisible}
                onClose={hideDatePicker}
                currentFilter={periodFilter}
                onSelect={onDateSelect}
            />

            <SubAccountListModal
                visible={isSubAccountsModalVisible}
                onClose={onHideSubAccounts}
                parentName={accountName}
                subAccounts={subAccounts}
                isLoading={subAccountsLoading}
            />
        </Screen>
    );
}

const styles = StyleSheet.create({
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: Spacing.lg,
        padding: Spacing.lg,
    },
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
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: Spacing.sm,
    },
    chartContainer: {
        marginTop: Spacing.md,
        alignItems: 'center',
    },
    listContainer: {
        paddingHorizontal: Spacing.lg,
        paddingBottom: Spacing.xxxxl * 2.5,
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
});
