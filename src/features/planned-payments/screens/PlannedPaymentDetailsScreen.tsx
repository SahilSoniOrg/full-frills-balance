import { TransactionCard } from '@/src/components/common/TransactionCard';
import { AppButton, AppCard, AppIcon, AppText, Badge, IconName, LoadingView } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { AppConfig, Spacing, withOpacity } from '@/src/constants';
import { useAccount } from '@/src/features/accounts/hooks/useAccounts';
import { usePlannedPaymentDetails } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetails';
import { useTheme } from '@/src/hooks/use-theme';
import { JournalDisplayType } from '@/src/types/domain';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import { journalPresenter } from '@/src/utils/journalPresenter';
import { AppNavigation } from '@/src/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Alert, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export default function PlannedPaymentDetailsScreen() {
    const { theme } = useTheme();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { item, history, isLoading, handleEdit, handleDelete, handleToggleStatus, handlePostNow, handleSkip } = usePlannedPaymentDetails(id);

    const { account: fromAccount } = useAccount(item?.fromAccountId || null);
    const { account: toAccount } = useAccount(item?.toAccountId || null);

    if (isLoading || !item) {
        return <LoadingView loading={isLoading} />;
    }

    const isIncome = item.amount > 0 && fromAccount?.accountType === 'INCOME';
    const isTransfer = item.toAccountId && toAccount?.accountType !== 'EXPENSE' && toAccount?.accountType !== 'INCOME';
    const displayType = isTransfer ? JournalDisplayType.TRANSFER : (isIncome ? JournalDisplayType.INCOME : JournalDisplayType.EXPENSE);

    const presentation = journalPresenter.getPresentation(displayType);
    const accentColor = theme[presentation.colorKey as keyof typeof theme] as string;

    const getIntervalLabel = () => {
        const n = item.intervalN;
        const type = item.intervalType;

        let baseLabel = '';
        if (n === 1) {
            switch (type) {
                case 'DAILY': baseLabel = AppConfig.strings.plannedPayments.everyDay; break;
                case 'WEEKLY': baseLabel = AppConfig.strings.plannedPayments.everyWeek; break;
                case 'MONTHLY': baseLabel = AppConfig.strings.plannedPayments.everyMonth; break;
                case 'YEARLY': baseLabel = AppConfig.strings.plannedPayments.everyYear; break;
            }
        } else {
            baseLabel = AppConfig.strings.plannedPayments.everyN(n, type.toLowerCase());
        }

        let detailLabel = '';
        if (type === 'WEEKLY' && item.recurrenceDay !== undefined && item.recurrenceDay !== null) {
            const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
            detailLabel = ` on ${days[item.recurrenceDay]}`;
        } else if (type === 'MONTHLY' && item.recurrenceDay !== undefined && item.recurrenceDay !== null) {
            detailLabel = ` on day ${item.recurrenceDay}`;
        } else if (type === 'YEARLY') {
            const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
            const monthStr = item.recurrenceMonth ? months[item.recurrenceMonth - 1] : '';
            const dayStr = item.recurrenceDay ? ` day ${item.recurrenceDay}` : '';
            if (monthStr || dayStr) {
                detailLabel = ` on ${monthStr}${dayStr}`;
            }
        }

        return `${baseLabel}${detailLabel}`;
    };

    return (
        <Screen
            title={AppConfig.strings.plannedPayments.title}
            showBack={true}
        >
            <View style={styles.headerRightContainer}>
                <TouchableOpacity onPress={handleEdit} style={styles.headerAction}>
                    <Ionicons name="pencil" size={20} color={theme.text} />
                </TouchableOpacity>
            </View>
            <ScrollView style={styles.content} contentContainerStyle={styles.scrollContent}>
                {/* Hero Header */}
                <View style={styles.hero}>
                    <View style={[styles.glowCircle, { backgroundColor: withOpacity(accentColor, 0.15) }]} />
                    <View style={[styles.iconContainer, { backgroundColor: accentColor }]}>
                        <AppIcon name={displayType === JournalDisplayType.INCOME ? 'arrowUp' : (displayType === JournalDisplayType.EXPENSE ? 'arrowDown' : 'swapHorizontal')} size={32} color={theme.onPrimary} />
                    </View>
                    <AppText variant="caption" color="secondary" style={styles.heroLabel}>
                        {item.name}
                    </AppText>
                    <AppText variant="xl" weight="bold" style={styles.heroAmount} color="primary">
                        {CurrencyFormatter.format(item.amount, item.currencyCode)}
                    </AppText>
                    <Badge
                        variant={item.status === 'ACTIVE' ? 'success' : 'default'}
                        size="md"
                        style={styles.statusBadge}
                    >
                        {item.status}
                    </Badge>
                </View>

                {/* Recurrence Details Card */}
                <AppCard padding="lg" style={styles.infoCard}>
                    <View style={styles.row}>
                        <View style={styles.infoItem}>
                            <AppText variant="caption" color="tertiary" style={styles.label}>
                                {AppConfig.strings.plannedPayments.recurrenceTitle}
                            </AppText>
                            <AppText variant="body" weight="bold">
                                {getIntervalLabel()}
                            </AppText>
                        </View>
                        <View style={styles.infoItem}>
                            <AppText variant="caption" color="tertiary" style={styles.label}>
                                {AppConfig.strings.plannedPayments.nextOccurrence('').replace(': ', '')}
                            </AppText>
                            <AppText variant="body" weight="bold">
                                {new Date(item.nextOccurrence).toLocaleDateString()}
                            </AppText>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.border }]} />

                    <View style={styles.autoPostRow}>
                        <View>
                            <AppText variant="body" weight="bold">{AppConfig.strings.plannedPayments.autoPostLabel}</AppText>
                            <AppText variant="caption" color="secondary">Automatically post transactions on due date</AppText>
                        </View>
                        <Badge variant={item.isAutoPost ? 'success' : 'default'}>
                            {item.isAutoPost ? 'ON' : 'OFF'}
                        </Badge>
                    </View>
                </AppCard>

                {/* Account Flow */}
                <AppText variant="subheading" weight="bold" style={styles.sectionTitle}>Account Flow</AppText>
                <AppCard padding="none" style={styles.flowCard}>
                    <View style={styles.accountRow}>
                        <View style={styles.accountInfo}>
                            <View style={[styles.accountIcon, { backgroundColor: withOpacity(theme.text, 0.05) }]}>
                                <AppIcon name={(fromAccount?.icon as IconName) || 'wallet'} size={20} color={theme.text} />
                            </View>
                            <View style={styles.accountTextContainer}>
                                <AppText variant="caption" color="secondary" numberOfLines={1}>From</AppText>
                                <AppText variant="body" weight="bold" numberOfLines={1}>{fromAccount?.name || 'Loading...'}</AppText>
                            </View>
                        </View>
                        <View style={styles.arrowContainer}>
                            <Ionicons name="arrow-forward" size={18} color={theme.textTertiary} />
                        </View>
                        <View style={[styles.accountInfo, { alignItems: 'flex-end' }]}>
                            <View style={styles.accountTextContainer}>
                                <AppText variant="caption" color="secondary" align="right" numberOfLines={1}>To</AppText>
                                <AppText variant="body" weight="bold" align="right" numberOfLines={1}>{toAccount?.name || 'Loading...'}</AppText>
                            </View>
                            <View style={[styles.accountIcon, { backgroundColor: withOpacity(theme.text, 0.05) }]}>
                                <AppIcon name={(toAccount?.icon as IconName) || 'swap-horizontal'} size={20} color={theme.text} />
                            </View>
                        </View>
                    </View>
                </AppCard>

                {/* History Section */}
                <AppText variant="subheading" weight="bold" style={styles.sectionTitle}>History</AppText>
                {history.length === 0 ? (
                    <AppCard padding="lg" style={styles.emptyHistory}>
                        <AppText color="secondary" style={{ textAlign: 'center' }}>No transactions generated yet.</AppText>
                    </AppCard>
                ) : (
                    <View style={styles.historyList}>
                        {history.map((journal) => (
                            <TransactionCard
                                key={journal.id}
                                title={journal.description || 'Transaction'}
                                amount={journal.totalAmount}
                                currencyCode={journal.currencyCode}
                                transactionDate={journal.journalDate}
                                presentation={{
                                    label: journal.status === 'PLANNED' ? 'Scheduled' : 'Posted',
                                    typeIcon: journal.displayType === 'INCOME' ? 'arrowUp' : (journal.displayType === 'EXPENSE' ? 'arrowDown' : 'swapHorizontal'),
                                    typeColor: journal.status === 'PLANNED' ? 'textSecondary' : (journal.displayType === 'INCOME' ? 'income' : (journal.displayType === 'EXPENSE' ? 'expense' : 'transfer')),
                                }}
                                badges={journal.accounts.slice(0, 1).map(acc => ({
                                    text: acc.name,
                                    variant: getAccountTypeVariant(acc.accountType),
                                    icon: acc.icon as IconName
                                }))}
                                onPress={() => AppNavigation.toTransactionDetails(journal.id)}
                            />
                        ))}
                    </View>
                )}

                {/* Actions */}
                <View style={styles.actions}>
                    <AppButton
                        variant="primary"
                        onPress={() => {
                            Alert.alert(
                                'Post Transaction Now?',
                                `This will post the upcoming instance for ${CurrencyFormatter.format(item.amount, item.currencyCode)} and advance the schedule to the next occurrence.`,
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Post Now', onPress: handlePostNow }
                                ]
                            );
                        }}
                        style={{ flex: 1 }}
                    >
                        <View style={styles.buttonInner}>
                            <AppIcon name="checkmark" size={18} color={theme.onPrimary} />
                            <AppText variant="body" weight="bold" style={{ marginLeft: Spacing.sm, color: theme.onPrimary }}>
                                Mark as Paid
                            </AppText>
                        </View>
                    </AppButton>
                    <View style={{ width: Spacing.md }} />
                    <AppButton
                        variant="outline"
                        onPress={() => {
                            Alert.alert(
                                'Skip Occurrence?',
                                `This will skip the upcoming instance on ${new Date(item.nextOccurrence).toLocaleDateString()} and advance the schedule without creating a transaction.`,
                                [
                                    { text: 'Cancel', style: 'cancel' },
                                    { text: 'Skip Now', style: 'destructive', onPress: handleSkip }
                                ]
                            );
                        }}
                        style={{ flex: 1 }}
                    >
                        <View style={styles.buttonInner}>
                            <AppIcon name="close" size={18} color={theme.text} />
                            <AppText variant="body" weight="bold" style={{ marginLeft: Spacing.sm }}>
                                Skip
                            </AppText>
                        </View>
                    </AppButton>
                </View>

                <View style={[styles.actions, { marginTop: Spacing.sm }]}>
                    <AppButton
                        variant="secondary"
                        onPress={handleToggleStatus}
                        style={{ flex: 1 }}
                    >
                        <View style={styles.buttonInner}>
                            <AppIcon name={item.status === 'ACTIVE' ? 'pause' : 'play'} size={16} color={theme.text} />
                            <AppText variant="body" weight="semibold" style={{ marginLeft: Spacing.sm }}>
                                {item.status === 'ACTIVE' ? 'Pause' : 'Resume'}
                            </AppText>
                        </View>
                    </AppButton>
                    <View style={{ width: Spacing.md }} />
                    <AppButton
                        variant="outline"
                        onPress={handleDelete}
                        style={{ flex: 1 }}
                    >
                        <View style={styles.buttonInner}>
                            <AppIcon name="trash" size={16} color={theme.error} />
                            <AppText variant="body" weight="semibold" color="error" style={{ marginLeft: Spacing.sm }}>
                                Delete
                            </AppText>
                        </View>
                    </AppButton>
                </View>
            </ScrollView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    content: {
        flex: 1,
    },
    scrollContent: {
        padding: Spacing.lg,
        paddingBottom: Spacing.xxl * 3,
    },
    headerRightContainer: {
        position: 'absolute',
        top: 0,
        right: Spacing.lg,
        zIndex: 10,
    },
    headerAction: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    hero: {
        alignItems: 'center',
        paddingVertical: Spacing.xl,
        marginBottom: Spacing.lg,
    },
    glowCircle: {
        position: 'absolute',
        width: 140,
        height: 140,
        borderRadius: 70,
        top: Spacing.lg,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: Spacing.md,
        elevation: 4,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
    },
    heroLabel: {
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: Spacing.xs,
    },
    heroAmount: {
        fontSize: 38,
        marginBottom: Spacing.sm,
        paddingVertical: Spacing.xs,
        includeFontPadding: false,
    },
    statusBadge: {
        marginTop: Spacing.xs,
    },
    infoCard: {
        marginBottom: Spacing.lg,
    },
    row: {
        flexDirection: 'row',
        justifyContent: 'space-between',
    },
    infoItem: {
        flex: 1,
    },
    label: {
        marginBottom: Spacing.xs,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    divider: {
        height: 1,
        marginVertical: Spacing.md,
        opacity: 0.5,
    },
    autoPostRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    sectionTitle: {
        marginBottom: Spacing.md,
        marginTop: Spacing.sm,
    },
    flowCard: {
        marginBottom: Spacing.lg,
    },
    accountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: Spacing.lg,
        justifyContent: 'space-between',
    },
    accountInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        maxWidth: '45%',
    },
    accountTextContainer: {
        flex: 1,
        flexShrink: 1,
    },
    arrowContainer: {
        paddingHorizontal: Spacing.xs,
    },
    accountIcon: {
        width: 40,
        height: 40,
        borderRadius: 20,
        alignItems: 'center',
        justifyContent: 'center',
    },
    historyList: {
        marginBottom: Spacing.lg,
    },
    emptyHistory: {
        marginBottom: Spacing.lg,
        borderStyle: 'dashed',
        borderWidth: 1,
        borderColor: withOpacity('#000', 0.1),
    },
    actions: {
        flexDirection: 'row',
        marginTop: Spacing.md,
    },
    buttonInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
});
