import { AppButton, AppCard, AppIcon, AppText, Badge, IconButton } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { TransactionDetailsViewModel } from '@/src/features/journal/hooks/useTransactionDetailsViewModel';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

export function TransactionDetailsView(vm: TransactionDetailsViewModel) {
    const {
        theme,
        isLoading,
        isMissing,
        title,
        backIcon,
        headerActions,
        amountText,
        descriptionText,
        statusLabel,
        statusVariant,
        displayTypeLabel,
        formattedDate,
        journalIdShort,
        onHistoryPress,
        onBack,
        splitItems,
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
            <Screen title="Details" backIcon="close">
                <View style={styles.center}>
                    <AppIcon name="error" size={48} color={theme.textSecondary} />
                    <AppText variant="subheading" style={{ marginTop: Spacing.md }}>Transaction not found</AppText>
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
                name="copy"
                onPress={headerActions.onCopy}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.text}
                testID="copy-button"
            />
            <IconButton
                name="edit"
                onPress={headerActions.onEdit}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.text}
                testID="edit-button"
            />
            <IconButton
                name="delete"
                onPress={headerActions.onDelete}
                variant="clear"
                size={Typography.sizes.xl}
                iconColor={theme.error}
                testID="delete-button"
            />
        </View>
    );

    return (
        <Screen
            title={title}
            backIcon={backIcon}
            headerActions={headerActionsNode}
            scrollable
            withPadding
        >
            <View style={styles.content}>
                <AppCard elevation="md" radius="r2" padding="lg" style={styles.receiptCard}>
                    <View style={styles.iconContainer}>
                        <View style={[styles.bigIcon, { backgroundColor: withOpacity(theme.primary, Opacity.soft) }]}>
                            <AppIcon name="receipt" size={32} color={theme.primary} />
                        </View>
                    </View>

                    <View style={styles.headerSection}>
                        <AppText variant="title" style={{ fontSize: Typography.sizes.xxxl, marginBottom: Spacing.sm }}>
                            {amountText}
                        </AppText>
                        <AppText variant="body" color="secondary">
                            {descriptionText}
                        </AppText>
                        <View style={{ flexDirection: 'row', gap: Spacing.sm, marginTop: Spacing.md }}>
                            <Badge variant={statusVariant} size="sm">
                                {statusLabel}
                            </Badge>
                            {displayTypeLabel && (
                                <Badge variant="default" size="sm">
                                    {displayTypeLabel}
                                </Badge>
                            )}
                        </View>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    <View style={styles.infoSection}>
                        <InfoRow label="Date" value={formattedDate} />
                        <InfoRow label="Journal ID" value={journalIdShort} />
                        <TouchableOpacity
                            style={styles.historyLink}
                            onPress={onHistoryPress}
                        >
                            <AppText variant="caption" color="secondary" style={styles.infoLabel}>History</AppText>
                            <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: Spacing.xs }}>
                                <AppText variant="body" color="primary">View Edit History</AppText>
                                <AppIcon name="chevronRight" size={Typography.sizes.sm} color={theme.primary} />
                            </View>
                        </TouchableOpacity>
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.md }}>
                        BREAKDOWN
                    </AppText>

                    {splitItems.map((item) => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.splitRow}
                            onPress={item.onPress}
                        >
                            <View style={styles.splitIconContainer}>
                                <View style={[styles.directionIcon, { backgroundColor: item.iconBackground }]}>
                                    <AppIcon
                                        name={item.iconName}
                                        size={16}
                                        color={item.iconColor}
                                    />
                                </View>
                            </View>
                            <View style={styles.splitInfo}>
                                <AppText variant="body" color="primary">{item.accountName}</AppText>
                                <AppText variant="caption" color="secondary">{item.transactionType}</AppText>
                            </View>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                                <AppText variant="subheading" style={{ color: item.amountColor }}>
                                    {item.amountText}
                                </AppText>
                                <AppIcon name="chevronRight" size={Typography.sizes.sm} color={theme.textSecondary} />
                            </View>
                        </TouchableOpacity>
                    ))}
                </AppCard>
            </View>
        </Screen>
    );
}

const InfoRow = ({ label, value }: { label: string, value: string }) => (
    <View style={styles.infoRow}>
        <AppText variant="caption" color="secondary" style={styles.infoLabel}>{label}</AppText>
        <AppText variant="body" style={{ flex: 1, textAlign: 'right' }}>{value}</AppText>
    </View>
);

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
