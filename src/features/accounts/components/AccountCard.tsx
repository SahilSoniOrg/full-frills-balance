import { AppCard, AppIcon, AppText, IvyIcon } from '@/src/components/core';
import { Shape, Size, Spacing, Typography } from '@/src/constants';
import { AccountCardViewModel } from '@/src/features/accounts/utils/transformAccounts';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface AccountCardProps {
    account: AccountCardViewModel;
    onPress: () => void;
    onCollapse?: () => void;
    dividerColor: string;
    surfaceColor: string;
}

export function AccountCard({
    account,
    onPress,
    onCollapse,
    dividerColor,
    surfaceColor,
}: AccountCardProps) {
    const { fonts } = useTheme();
    return (
        <AppCard
            elevation="sm"
            style={[
                styles.cardContainer,
                {
                    backgroundColor: surfaceColor,
                    marginLeft: account.depth * Spacing.lg,
                    opacity: account.depth > 0 ? 0.9 : 1
                }
            ]}
            padding="none"
        >
            <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
                <View style={[styles.headerSection, { backgroundColor: account.accentColor }]}>
                    <View style={styles.cardHeaderTop}>
                        <IvyIcon
                            name={account.icon as any}
                            label={account.name}
                            color={account.textColor}
                            size={Size.avatarSm}
                        />
                        <AppText
                            variant="body"
                            weight="bold"
                            style={[styles.accountName, { color: account.textColor }]}
                            numberOfLines={1}
                        >
                            {account.name}
                        </AppText>
                        {account.hasChildren && (
                            <View style={styles.headerRight}>
                                {account.isExpanded ? (
                                    <TouchableOpacity
                                        onPress={(e) => {
                                            e.stopPropagation();
                                            onCollapse?.();
                                        }}
                                        style={styles.collapseButton}
                                    >
                                        <AppIcon name="chevronUp" color={account.textColor} size={20} />
                                    </TouchableOpacity>
                                ) : (
                                    <IvyIcon name="folder" color={account.textColor} size={16} />
                                )}
                            </View>
                        )}
                    </View>

                    <View style={styles.balanceSection}>
                        <AppText
                            variant="title"
                            weight="bold"
                            style={[styles.balanceText, { color: account.textColor, fontFamily: fonts.bold }]}
                        >
                            {account.balanceText}
                        </AppText>
                    </View>
                </View>

                {account.showMonthlyStats && (
                    <View
                        style={[styles.footerSection, { backgroundColor: surfaceColor }]}
                        accessibilityLabel={`Monthly statistics for ${account.name}`}
                        accessibilityRole="summary"
                    >
                        <View
                            style={styles.statsColumn}
                            accessibilityLabel={`Monthly Income: ${account.monthlyIncomeText}`}
                        >
                            <AppText variant="caption" weight="bold" color="secondary" style={styles.statsLabel}>
                                MONTH INCOME
                            </AppText>
                            <AppText variant="body" weight="bold" style={styles.statsValue}>
                                {account.monthlyIncomeText}
                            </AppText>
                        </View>

                        <View
                            style={[styles.divider, { backgroundColor: dividerColor }]}
                            accessibilityRole="none"
                        />

                        <View
                            style={styles.statsColumn}
                            accessibilityLabel={`Monthly Expenses: ${account.monthlyExpenseText}`}
                        >
                            <AppText variant="caption" weight="bold" color="secondary" style={styles.statsLabel}>
                                MONTH EXPENSES
                            </AppText>
                            <AppText variant="body" weight="bold" style={styles.statsValue}>
                                {account.monthlyExpenseText}
                            </AppText>
                        </View>
                    </View>
                )}
            </TouchableOpacity>
        </AppCard>
    );
}

const styles = StyleSheet.create({
    cardContainer: {
        marginBottom: Spacing.lg,
        borderRadius: Shape.radius.xl,
        overflow: 'hidden',
    },
    headerSection: {
        paddingHorizontal: Spacing.lg,
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.xxl,
    },
    cardHeaderTop: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.md,
        marginBottom: Spacing.md,
    },
    accountName: {
        fontSize: Typography.sizes.lg,
        flex: 1,
    },
    headerRight: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    collapseButton: {
        padding: Spacing.xs,
        marginRight: -Spacing.xs,
    },
    balanceSection: {
        alignItems: 'center',
        justifyContent: 'center',
    },
    balanceText: {
        fontSize: Typography.sizes.xxxl,
    },
    footerSection: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.lg,
    },
    statsColumn: {
        flex: 1,
        alignItems: 'center',
    },
    statsLabel: {
        fontSize: Typography.sizes.xs,
        marginBottom: Spacing.xs,
    },
    statsValue: {
        fontSize: Typography.sizes.sm,
    },
    divider: {
        width: 1,
        height: Spacing.xl, // Adjusted height for better visual
    },
});
