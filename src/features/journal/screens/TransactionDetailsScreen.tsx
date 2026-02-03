import { AppButton, AppCard, AppIcon, AppText, Badge, IconButton } from '@/src/components/core'
import { Screen } from '@/src/components/layout'
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants'
import { useJournal } from '@/src/features/journal/hooks/useJournal'
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions'
import { useJournalTransactions } from '@/src/features/journal/hooks/useJournals'
import { useTheme } from '@/src/hooks/use-theme'
import { TransactionWithAccountInfo } from '@/src/types/domain'
import { showConfirmationAlert, showErrorAlert, showSuccessAlert } from '@/src/utils/alerts'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import { formatDate } from '@/src/utils/dateUtils'
import { logger } from '@/src/utils/logger'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React from 'react'
import { StyleSheet, TouchableOpacity, View } from 'react-native'

// Reusable info row component
const InfoRow = ({ label, value }: { label: string, value: string }) => (
    <View style={styles.infoRow}>
        <AppText variant="caption" color="secondary" style={styles.infoLabel}>{label}</AppText>
        <AppText variant="body" style={{ flex: 1, textAlign: 'right' }}>{value}</AppText>
    </View>
);

export default function TransactionDetailsScreen() {
    const router = useRouter()
    const { journalId } = useLocalSearchParams<{ journalId: string }>()
    const { theme } = useTheme()
    const { deleteJournal, findJournal, duplicateJournal } = useJournalActions()
    const { transactions, isLoading: isLoadingTransactions } = useJournalTransactions(journalId)
    const { journal, isLoading: isLoadingJournal } = useJournal(journalId)

    const journalInfo = journal ? {
        description: journal.description,
        date: journal.journalDate,
        status: journal.status,
        currency: journal.currencyCode,
        displayType: journal.displayType
    } : null;

    const isLoading = isLoadingTransactions || isLoadingJournal;

    const totalAmount = transactions
        .filter((t: TransactionWithAccountInfo) => t.flowDirection === 'IN')
        .reduce((sum: number, t: TransactionWithAccountInfo) => sum + (t.amount || 0), 0);

    const formattedDate = journalInfo ? formatDate(journalInfo.date, { includeTime: true }) : '';

    const handleDelete = () => {
        showConfirmationAlert(
            'Delete Transaction',
            'Are you sure you want to delete this transaction? This action cannot be undone.',
            async () => {
                try {
                    const journal = await findJournal(journalId);
                    if (!journal) {
                        showErrorAlert('Transaction not found. It may have already been deleted.');
                        router.back();
                        return;
                    }
                    await deleteJournal(journal);
                    showSuccessAlert('Deleted', 'Transaction has been deleted.');
                    router.back();
                } catch (error) {
                    logger.error('Failed to delete transaction:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showErrorAlert(`Could not delete transaction: ${errorMessage}`);
                }
            }
        );
    };

    const handleCopy = async () => {
        try {
            const newJournal = await duplicateJournal(journalId);
            showSuccessAlert('Copied', 'New transaction created from copy.');
            // Navigate to edit the new copy
            router.push({ pathname: '/journal-entry', params: { journalId: newJournal.id } });
        } catch (error) {
            logger.error('Failed to copy transaction:', error);
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            showErrorAlert(`Could not copy transaction: ${errorMessage}`);
        }
    };

    const HeaderActions = (
        <View style={styles.headerActions}>
            <IconButton
                name="copy"
                onPress={handleCopy}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.text}
                testID="copy-button"
            />
            <IconButton
                name="edit"
                onPress={() => router.push({ pathname: '/journal-entry', params: { journalId } })}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.text}
                testID="edit-button"
            />
            <IconButton
                name="delete"
                onPress={handleDelete}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.error}
                testID="delete-button"
            />
        </View>
    );

    if (isLoading) return (
        <Screen title="Details">
            <View style={styles.center}><AppText variant="body">Loading...</AppText></View>
        </Screen>
    );

    if (!journalInfo) return (
        <Screen title="Details" backIcon="close">
            <View style={styles.center}>
                <AppIcon name="error" size={48} color={theme.textSecondary} />
                <AppText variant="subheading" style={{ marginTop: Spacing.md }}>Transaction not found</AppText>
                <AppButton
                    variant="ghost"
                    onPress={() => router.back()}
                    style={{ marginTop: Spacing.lg }}
                >
                    Go Back
                </AppButton>
            </View>
        </Screen>
    );

    return (
        <Screen
            title="Transaction Details"
            backIcon="close"
            headerActions={HeaderActions}
            scrollable
            withPadding
        >
            <View style={styles.content}>
                {/* Receipt Card */}
                <AppCard elevation="md" radius="r2" padding="lg" style={styles.receiptCard}>

                    {/* Big Icon */}
                    <View style={styles.iconContainer}>
                        <View style={[styles.bigIcon, { backgroundColor: withOpacity(theme.primary, Opacity.soft) }]}>
                            <AppIcon name="receipt" size={32} color={theme.primary} />
                        </View>
                    </View>

                    {/* Amount & Title */}
                    <View style={styles.headerSection}>
                        <AppText variant="title" style={{ fontSize: Typography.sizes.xxxl, marginBottom: Spacing.sm }}>
                            {CurrencyFormatter.format(totalAmount, journalInfo?.currency)}
                        </AppText>
                        <AppText variant="body" color="secondary">
                            {journalInfo?.description || 'No description'}
                        </AppText>
                        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
                            <Badge variant={journalInfo?.status === 'POSTED' ? 'income' : 'expense'} size="sm">
                                {journalInfo?.status}
                            </Badge>
                            {journalInfo?.displayType && (
                                <Badge variant="default" size="sm">
                                    {journalInfo.displayType}
                                </Badge>
                            )}
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    {/* Metadata List */}
                    <View style={styles.infoSection}>
                        <InfoRow label="Date" value={formattedDate} />
                        <InfoRow label="Journal ID" value={journalId?.substring(0, 8) || '...'} />
                        <TouchableOpacity
                            style={styles.historyLink}
                            onPress={() => router.push(`/audit-log?entityType=journal&entityId=${journalId}` as any)}
                        >
                            <AppText variant="caption" color="secondary" style={styles.infoLabel}>History</AppText>
                            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.xs }}>
                                <AppText variant="body" color="primary">View Edit History</AppText>
                                <AppIcon name="chevronRight" size={Typography.sizes.sm} color={theme.primary} />
                            </View>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    {/* Splits / Breakdown */}
                    <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.md }}>
                        BREAKDOWN
                    </AppText>

                    {transactions.map((item: TransactionWithAccountInfo) => {
                        const isIn = item.flowDirection === 'IN';
                        return (
                            <TouchableOpacity
                                key={item.id}
                                style={styles.splitRow}
                                onPress={() => router.push(`/account-details?accountId=${item.accountId}` as any)}
                            >
                                <View style={styles.splitIconContainer}>
                                    <View style={[
                                        styles.directionIcon,
                                        { backgroundColor: withOpacity(isIn ? theme.income : theme.error, Opacity.soft) }
                                    ]}>
                                        <AppIcon
                                            name={isIn ? 'arrowDown' : 'arrowUp'}
                                            size={16}
                                            color={isIn ? theme.income : theme.error}
                                        />
                                    </View>
                                </View>
                                <View style={styles.splitInfo}>
                                    <AppText variant="body" color="primary">{item.accountName}</AppText>
                                    <AppText variant="caption" color="secondary">{item.transactionType}</AppText>
                                </View>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                                    <AppText variant="subheading" style={{ color: isIn ? theme.income : theme.error }}>
                                        {isIn ? '+' : '-'}{CurrencyFormatter.format(item.amount, item.currencyCode)}
                                    </AppText>
                                    <AppIcon name="chevronRight" size={Typography.sizes.sm} color={theme.textSecondary} />
                                </View>
                            </TouchableOpacity>
                        );
                    })}

                </AppCard>
            </View>
        </Screen>
    );
}

const styles = StyleSheet.create({
    center: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    content: {
        paddingVertical: Spacing.lg,
    },
    receiptCard: {
        width: '100%',
    },
    iconContainer: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
        marginTop: Spacing.md,
    },
    bigIcon: {
        width: Size.avatarLg,
        height: Size.avatarLg,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerSection: {
        alignItems: 'center',
        marginBottom: Spacing.lg,
    },
    divider: {
        height: 1,
        marginVertical: Spacing.lg,
    },
    infoSection: {
        gap: Spacing.sm,
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: Spacing.xs,
    },
    infoLabel: {
        width: 110,
    },
    historyLink: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.xs,
    },
    splitRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.sm,
    },
    splitInfo: {
        flex: 1,
    },
    splitIconContainer: {
        marginRight: Spacing.md,
    },
    directionIcon: {
        width: Size.lg,
        height: Size.lg,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
});
