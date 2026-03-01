import { ScreenHeaderActions } from '@/src/components/common/ScreenHeaderActions';
import { AppButton, AppCard, AppIcon, AppText, Badge, ListRow } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { TransactionDetailsViewModel } from '@/src/features/journal/hooks/useTransactionDetailsViewModel';
import React from 'react';
import { StyleSheet, View } from 'react-native';

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
        <ScreenHeaderActions
            actions={[
                {
                    name: 'copy',
                    onPress: headerActions.onCopy,
                    iconColor: theme.text,
                    size: Typography.sizes.xl,
                    testID: 'copy-button',
                },
                {
                    name: 'edit',
                    onPress: headerActions.onEdit,
                    iconColor: theme.text,
                    size: Typography.sizes.xl,
                    testID: 'edit-button',
                },
                {
                    name: 'delete',
                    onPress: headerActions.onDelete,
                    iconColor: theme.error,
                    size: Typography.sizes.xl,
                    testID: 'delete-button',
                },
            ]}
        />
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
                        <ListRow
                            title="Date"
                            trailing={<AppText variant="body">{formattedDate}</AppText>}
                            padding="sm"
                        />
                        <ListRow
                            title="Journal ID"
                            trailing={<AppText variant="body">{journalIdShort}</AppText>}
                            padding="sm"
                        />
                        <ListRow
                            title="History"
                            trailing={
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                                    <AppText variant="body" color="primary">View Edit History</AppText>
                                    <AppIcon name="chevronRight" size={Typography.sizes.sm} color={theme.primary} />
                                </View>
                            }
                            onPress={onHistoryPress}
                            padding="sm"
                        />

                        {vm.onPost && (
                            <View style={{ padding: Spacing.md, gap: Spacing.sm }}>
                                <AppButton
                                    variant="primary"
                                    onPress={vm.onPost}
                                    style={{ width: '100%' }}
                                >
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                                        <AppIcon name="checkmark" size={18} color={theme.onPrimary} />
                                        <AppText variant="body" weight="bold" style={{ color: theme.onPrimary }}>
                                            Post Transaction Now
                                        </AppText>
                                    </View>
                                </AppButton>

                                {vm.onSkip && (
                                    <AppButton
                                        variant="outline"
                                        onPress={vm.onSkip}
                                        style={{ width: '100%' }}
                                    >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.sm }}>
                                            <AppIcon name="close" size={18} color={theme.text} />
                                            <AppText variant="body" weight="bold">
                                                Skip This Occurrence
                                            </AppText>
                                        </View>
                                    </AppButton>
                                )}
                            </View>
                        )}
                    </View>

                    <View style={[styles.divider, { backgroundColor: theme.divider }]} />

                    <AppText variant="caption" color="secondary" style={{ marginBottom: Spacing.md, paddingHorizontal: Spacing.md }}>
                        BREAKDOWN
                    </AppText>

                    {splitItems.map((item, index) => (
                        <ListRow
                            key={item.id}
                            title={item.accountName}
                            subtitle={item.transactionType}
                            leading={
                                <View style={[styles.directionIcon, { backgroundColor: item.iconBackground }]}>
                                    <AppIcon
                                        name={item.iconName as any}
                                        size={16}
                                        color={item.iconColor}
                                    />
                                </View>
                            }
                            trailing={
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: Spacing.xs }}>
                                    <AppText variant="subheading" style={{ color: item.amountColor }}>
                                        {item.amountText}
                                    </AppText>
                                    <AppIcon name="chevronRight" size={Typography.sizes.sm} color={theme.textSecondary} />
                                </View>
                            }
                            onPress={item.onPress}
                            padding="md"
                            showDivider={index < splitItems.length - 1}
                        />
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
        padding: 0, // ListRows handle their own horizontal padding
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
        gap: Spacing.xs,
    },
    directionIcon: {
        width: Size.lg,
        height: Size.lg,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
});
