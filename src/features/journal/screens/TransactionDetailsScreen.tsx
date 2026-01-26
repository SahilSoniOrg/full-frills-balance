import { Opacity, Shape, Spacing, Typography, withOpacity } from '@/constants'
import { AppButton, AppCard, AppText, Badge, IconButton } from '@/src/components/core'
import { Screen } from '@/src/components/layout'
import { useJournalActions } from '@/src/features/journal/hooks/useJournalActions'
import { useJournalTransactionsWithAccountInfo } from '@/src/features/journal/hooks/useJournalTransactionsWithAccountInfo'
import { useTheme } from '@/src/hooks/use-theme'
import { TransactionWithAccountInfo } from '@/src/types/domain'
import { showConfirmationAlert, showErrorAlert, showSuccessAlert } from '@/src/utils/alerts'
import { CurrencyFormatter } from '@/src/utils/currencyFormatter'
import { formatDate } from '@/src/utils/dateUtils'
import { Ionicons } from '@expo/vector-icons'
import { useLocalSearchParams, useRouter } from 'expo-router'
import React, { useEffect, useState } from 'react'
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
    const { deleteJournal, findJournal } = useJournalActions()
    const { transactions, isLoading: isLoadingTransactions } = useJournalTransactionsWithAccountInfo(journalId)

    const [journalInfo, setJournalInfo] = useState<{ description?: string; date: number; status: string; currency: string; displayType?: string } | null>(null);
    const [isLoadingJournal, setIsLoadingJournal] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadJournal = async () => {
            if (!journalId) return;
            try {
                setIsLoadingJournal(true);
                setError(null);
                const journal = await findJournal(journalId);

                if (journal) {
                    setJournalInfo({
                        description: journal.description,
                        date: journal.journalDate,
                        status: journal.status,
                        currency: journal.currencyCode,
                        displayType: journal.displayType
                    });
                }
            } catch (error) {
                console.error('Error loading journal:', error);
                setError('Journal not found or deleted');
            } finally {
                setIsLoadingJournal(false);
            }
        };
        loadJournal();
    }, [journalId, findJournal]);

    const isLoading = isLoadingTransactions || isLoadingJournal;

    const totalAmount = transactions
        .filter(t => t.transactionType === 'DEBIT')
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
                    console.error('Failed to delete transaction:', error);
                    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                    showErrorAlert(`Could not delete transaction: ${errorMessage}`);
                }
            }
        );
    };

    const HeaderActions = (
        <View style={styles.headerActions}>
            <IconButton
                name="create-outline"
                onPress={() => router.push({ pathname: '/journal-entry', params: { journalId } })}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.text}
            />
            <IconButton
                name="trash-outline"
                onPress={handleDelete}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.error}
            />
        </View>
    );

    if (isLoading) return (
        <Screen title="Details">
            <View style={styles.center}><AppText variant="body">Loading...</AppText></View>
        </Screen>
    );

    if (error || !journalInfo) return (
        <Screen title="Details" backIcon="close">
            <View style={styles.center}>
                <Ionicons name="alert-circle-outline" size={48} color={theme.textSecondary} />
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
                            <Ionicons name="receipt" size={32} color={theme.primary} />
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
                                <Ionicons name="chevron-forward" size={Typography.sizes.sm} color={theme.primary} />
                            </View>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    {/* Splits / Breakdown */}
                    <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.md }}>
                        BREAKDOWN
                    </AppText>

                    {transactions.map(item => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.splitRow}
                            onPress={() => router.push(`/account-details?accountId=${item.accountId}` as any)}
                        >
                            <View style={styles.splitInfo}>
                                <AppText variant="body" color="primary">{item.accountName}</AppText>
                                <AppText variant="caption" color="secondary">{item.transactionType}</AppText>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                                <AppText variant="subheading">
                                    {CurrencyFormatter.format(item.amount, journalInfo?.currency)}
                                </AppText>
                                <Ionicons name="chevron-forward" size={Typography.sizes.sm} color={theme.textSecondary} />
                            </View>
                        </TouchableOpacity>
                    ))}

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
        width: 64,
        height: 64,
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
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
});
