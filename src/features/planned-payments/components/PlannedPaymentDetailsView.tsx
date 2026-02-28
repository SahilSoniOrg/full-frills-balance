import { AppButton, AppCard, AppIcon, AppText, Badge, IconButton, IconName, IvyIcon } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { PlannedPaymentHistoryCard } from '@/src/features/planned-payments/components/PlannedPaymentHistoryCard';
import { PlannedPaymentDetailsViewModel } from '@/src/features/planned-payments/hooks/usePlannedPaymentDetailsViewModel';
import { getAccountTypeVariant } from '@/src/utils/accountCategory';
import { AppNavigation } from '@/src/utils/navigation';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, View } from 'react-native';

export function PlannedPaymentDetailsView(vm: PlannedPaymentDetailsViewModel) {
    const {
        theme,
        isLoading,
        isMissing,
        onBack,
        title,
        amountText,
        nameText,
        statusLabel,
        statusVariant,
        typeLabel,
        typeColorKey,
        iconName,
        intervalLabel,
        nextOccurrenceText,
        isAutoPost,
        fromAccount,
        toAccount,
        history,
        headerActions,
        onPost,
        onSkip,
        onToggleStatus,
    } = vm;

    if (isLoading) {
        return (
            <Screen title="Details">
                <View style={styles.center}><AppText variant="body">Loading...</AppText></View>
            </Screen>
        );
    }

    if (isMissing) {
        return (
            <Screen title="Details">
                <View style={styles.center}>
                    <AppIcon name="error" size={48} color={theme.textSecondary} />
                    <AppText variant="subheading" style={{ marginTop: Spacing.md }}>Planned Payment not found</AppText>
                    <AppButton
                        variant="ghost"
                        onPress={onBack}
                        style={{ marginTop: Spacing.lg }}
                    >
                        Go Back
                    </AppButton>
                </View>
            </Screen>
        );
    }

    const headerActionsNode = (
        <View style={styles.headerActions}>
            <IconButton
                name="edit"
                onPress={headerActions?.onEdit}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.text}
                testID="edit-button"
            />
            <IconButton
                name="delete"
                onPress={headerActions?.onDelete}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.error}
                testID="delete-button"
            />
        </View>
    );

    const accentColor = theme[typeColorKey as keyof typeof theme] as string;

    return (
        <Screen
            title={title}
            showBack={true}
            headerActions={headerActionsNode}
            scrollable
            withPadding
        >
            <View style={styles.content}>
                <AppCard elevation="md" radius="r2" padding="lg" style={styles.detailsCard}>
                    <View style={styles.accountHeader}>
                        <View style={[styles.bigIcon, { backgroundColor: withOpacity(accentColor, Opacity.soft) }]}>
                            <AppIcon name={iconName as IconName} size={32} color={accentColor} />
                        </View>
                        <View style={styles.titleInfo}>
                            <AppText variant="title" style={{ fontSize: Typography.sizes.xl, marginBottom: Spacing.xs }}>
                                {nameText}
                            </AppText>
                            <View style={styles.badgesRow}>
                                <Badge variant={statusVariant as any} size="sm">
                                    {statusLabel}
                                </Badge>
                                <Badge variant="default" size="sm">
                                    {typeLabel}
                                </Badge>
                                {isAutoPost && (
                                    <Badge variant="success" size="sm">
                                        AUTO-POST
                                    </Badge>
                                )}
                            </View>
                        </View>
                    </View>

                    <View style={styles.accountStats}>
                        <View style={styles.statItem}>
                            <AppText variant="caption" color="secondary">
                                Amount Next
                            </AppText>
                            <AppText variant="heading">
                                {amountText}
                            </AppText>
                        </View>
                        <View style={styles.statItem}>
                            <AppText variant="caption" color="secondary">
                                Date Next
                            </AppText>
                            <AppText variant="subheading">
                                {nextOccurrenceText}
                            </AppText>
                        </View>
                    </View>

                    <View style={[styles.accountStats, { paddingTop: 0 }]}>
                        <View style={styles.statItem}>
                            <AppText variant="caption" color="secondary">
                                Recurrence
                            </AppText>
                            <AppText variant="subheading">
                                {intervalLabel}
                            </AppText>
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    <View style={styles.flowSection}>
                        <AppText variant="caption" color="secondary" style={styles.flowTitle}>
                            ACCOUNT FLOW
                        </AppText>
                        <View style={styles.accountRow}>
                            <View style={styles.accountInfo}>
                                <IvyIcon
                                    name={fromAccount?.icon as any}
                                    label={fromAccount?.name}
                                    color={theme[getAccountTypeVariant(fromAccount?.accountType) as keyof typeof theme] as string || theme.text}
                                    size={Size.avatarMd}
                                    shape="circle"
                                />
                                <AppText variant="body" weight="bold" numberOfLines={1} style={styles.accountNameLeft}>
                                    {fromAccount?.name || 'Loading...'}
                                </AppText>
                            </View>
                            <View style={styles.arrowContainer}>
                                <Ionicons name="arrow-forward" size={16} color={theme.textTertiary} />
                            </View>
                            <View style={[styles.accountInfo, { justifyContent: 'flex-end' }]}>
                                <AppText variant="body" weight="bold" align="right" numberOfLines={1} style={styles.accountNameRight}>
                                    {toAccount?.name || 'Loading...'}
                                </AppText>
                                <IvyIcon
                                    name={toAccount?.icon as any}
                                    label={toAccount?.name}
                                    color={theme[getAccountTypeVariant(toAccount?.accountType) as keyof typeof theme] as string || theme.text}
                                    size={Size.avatarMd}
                                    shape="circle"
                                />
                            </View>
                        </View>
                    </View>
                </AppCard>

                <View style={styles.actionsContainer}>
                    <AppButton
                        variant="primary"
                        onPress={onPost}
                        style={{ width: '100%', marginBottom: Spacing.md }}
                    >
                        <View style={styles.buttonInner}>
                            <AppIcon name="checkmark" size={18} color={theme.onPrimary} />
                            <AppText variant="body" weight="bold" style={{ marginLeft: Spacing.sm, color: theme.onPrimary }}>
                                Post Next Occurrence
                            </AppText>
                        </View>
                    </AppButton>

                    <View style={styles.actionsRow}>
                        <AppButton
                            variant="outline"
                            onPress={onSkip}
                            style={{ flex: 1 }}
                        >
                            <View style={styles.buttonInner}>
                                <AppIcon name="close" size={18} color={theme.text} />
                                <AppText variant="body" weight="bold" style={{ marginLeft: Spacing.sm }}>
                                    Skip Next
                                </AppText>
                            </View>
                        </AppButton>

                        <View style={{ width: Spacing.md }} />

                        <AppButton
                            variant="secondary"
                            onPress={onToggleStatus}
                            style={{ flex: 1 }}
                        >
                            <View style={styles.buttonInner}>
                                <AppIcon name={statusLabel === 'ACTIVE' ? 'pause' : 'play'} size={16} color={theme.text} />
                                <AppText variant="body" weight="semibold" style={{ marginLeft: Spacing.sm }}>
                                    {statusLabel === 'ACTIVE' ? 'Pause' : 'Resume'}
                                </AppText>
                            </View>
                        </AppButton>
                    </View>
                </View>

                <AppText variant="subheading" weight="bold" style={[styles.sectionTitle, { marginLeft: Spacing.sm }]}>History</AppText>
                {history?.length === 0 ? (
                    <AppCard padding="lg" style={styles.emptyHistory} radius="r2">
                        <AppText color="secondary" style={{ textAlign: 'center' }}>No transactions generated yet.</AppText>
                    </AppCard>
                ) : (
                    <View style={styles.historyList}>
                        {history?.map((journal: any) => (
                            <PlannedPaymentHistoryCard
                                key={journal.id}
                                journalId={journal.id}
                                journalTitle={journal.description || 'Transaction'}
                                journalAmount={journal.totalAmount}
                                currencyCode={journal.currencyCode}
                                journalDate={journal.journalDate}
                                plannedAmount={vm.rawAmount ?? 0}
                                plannedTitle={vm.rawName ?? ''}
                                presentation={{
                                    label: journal.status === 'PLANNED' ? 'Scheduled' : 'Posted',
                                    typeIcon: journal.displayType === 'INCOME' ? 'arrowUp' : (journal.displayType === 'EXPENSE' ? 'arrowDown' : 'swapHorizontal'),
                                    typeColor: journal.status === 'PLANNED' ? 'textSecondary' : (journal.displayType === 'INCOME' ? 'income' : (journal.displayType === 'EXPENSE' ? 'expense' : 'transfer')),
                                }}
                                onPress={() => AppNavigation.toTransactionDetails(journal.id)}
                            />
                        ))}
                    </View>
                )}
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
    detailsCard: {
        width: '100%',
        padding: Spacing.lg,
        marginBottom: Spacing.lg,
    },
    accountHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: Spacing.md,
    },
    bigIcon: {
        width: Size.avatarLg,
        height: Size.avatarLg,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    titleInfo: {
        marginLeft: Spacing.md,
        flex: 1,
    },
    badgesRow: {
        flexDirection: 'row',
        gap: Spacing.xs,
        alignItems: 'center',
        flexWrap: 'wrap',
    },
    accountStats: {
        flexDirection: 'row',
        gap: Spacing.xl,
        paddingVertical: Spacing.sm,
    },
    statItem: {
        flex: 1,
    },
    divider: {
        height: 1,
        marginVertical: Spacing.md,
    },
    flowTitle: {
        marginBottom: Spacing.md,
    },
    flowSection: {
        marginTop: Spacing.xs,
    },
    accountRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    accountInfo: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    accountNameLeft: {
        flex: 1,
        marginLeft: Spacing.xs,
    },
    accountNameRight: {
        flex: 1,
        marginRight: Spacing.xs,
    },
    arrowContainer: {
        paddingHorizontal: Spacing.xs,
    },
    actionsContainer: {
        marginBottom: Spacing.xl,
        paddingHorizontal: Spacing.sm,
    },
    actionsRow: {
        flexDirection: 'row',
        gap: Spacing.md,
    },
    buttonInner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.xs,
    },
    sectionTitle: {
        marginBottom: Spacing.md,
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
});
