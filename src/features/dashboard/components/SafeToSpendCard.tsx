import { PopupModal } from '@/src/components/common/PopupModal';
import { AppCard, AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { AccountSubcategory, formatAccountSubcategoryLabel } from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { CurrencyFormatter } from '@/src/utils/currencyFormatter';
import React from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';

interface SafeToSpendCardProps {
    safeToSpend: number;
    committedBudget: number;
    committedRecurring: number;
    committedPlanned: number;
    totalLiquidAssets: number;
    totalLiabilities: number;
    currencyCode: string;
    liquidAssetSubcategories: AccountSubcategory[];
    liquidLiabilitySubcategories: AccountSubcategory[];
    budgetSubcategories: AccountSubcategory[];
    recurringSubcategories: AccountSubcategory[];
    liquidAssetAccountNames: string[];
    liquidLiabilityAccountNames: string[];
    budgetAccountNames: string[];
    recurringAccountNames: string[];
    isLoading?: boolean;
}

export const SafeToSpendCard = ({
    safeToSpend,
    committedBudget,
    committedRecurring,
    committedPlanned,
    totalLiquidAssets,
    totalLiabilities,
    currencyCode,
    liquidAssetSubcategories,
    liquidLiabilitySubcategories,
    budgetSubcategories,
    recurringSubcategories,
    liquidAssetAccountNames,
    liquidLiabilityAccountNames,
    budgetAccountNames,
    recurringAccountNames,
    isLoading = false
}: SafeToSpendCardProps) => {
    const { theme, fonts } = useTheme();
    const [isInfoVisible, setInfoVisible] = React.useState(false);
    const info = AppConfig.strings.dashboard.safeToSpendExplanation;

    const format = (val: number) => {
        if (isLoading) return '...';
        return CurrencyFormatter.format(val, currencyCode, {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0,
        });
    };

    const renderSubcategoryGroup = (
        title: string,
        subtitle: string,
        subcategories: AccountSubcategory[],
        accountNames: string[]
    ) => (
        <View style={styles.modalSection}>
            <AppText variant="body" weight="bold">{title}</AppText>
            <AppText variant="caption" color="secondary" style={styles.modalSectionHint}>
                {subtitle}
            </AppText>
            <View style={styles.modalMetaGroup}>
                <AppText variant="caption" weight="bold">Categories used</AppText>
                {subcategories.length > 0 ? (
                    <AppText variant="caption" color="secondary" style={styles.modalSectionValue}>
                        {subcategories.map(formatAccountSubcategoryLabel).join(', ')}
                    </AppText>
                ) : (
                    <AppText variant="caption" color="secondary" style={styles.modalSectionValue}>
                        None detected yet
                    </AppText>
                )}
            </View>
            <View style={styles.modalMetaGroup}>
                <AppText variant="caption" weight="bold">Accounts used</AppText>
                {accountNames.length > 0 ? (
                    <AppText variant="caption" color="secondary" style={styles.modalSectionValue}>
                        {accountNames.join(', ')}
                    </AppText>
                ) : (
                    <AppText variant="caption" color="secondary" style={styles.modalSectionValue}>
                        None detected yet
                    </AppText>
                )}
            </View>
        </View>
    );

    return (
        <>
            <AppCard
                elevation="md"
                padding="lg"
                radius="r1"
                style={[styles.container, { backgroundColor: theme.primary }]}
            >
                <View style={styles.kickerRow}>
                    <View style={[styles.kickerBadge, { backgroundColor: withOpacity(theme.onPrimary, Opacity.soft) }]}>
                        <AppIcon name="wallet" size={Size.xs} color={withOpacity(theme.onPrimary, Opacity.heavy)} />
                    </View>
                    <AppText variant="caption" style={[styles.kickerText, { color: withOpacity(theme.onPrimary, Opacity.heavy) }]}>
                        {AppConfig.strings.dashboard.safeToSpendTitle}
                    </AppText>
                    <TouchableOpacity
                        accessibilityRole="button"
                        accessibilityLabel="Open safe-to-spend calculation info"
                        onPress={() => setInfoVisible(true)}
                        style={[styles.infoButton, { backgroundColor: withOpacity(theme.onPrimary, Opacity.soft) }]}
                    >
                        <AppIcon
                            name="helpCircle"
                            fallbackIcon="helpCircle"
                            size={Size.xs}
                            color={withOpacity(theme.onPrimary, Opacity.heavy)}
                        />
                    </TouchableOpacity>
                </View>

                <View style={styles.amountWrap}>
                    <AppText variant="xl" style={[styles.amount, { color: theme.onPrimary, fontFamily: fonts.bold }]}>
                        {format(safeToSpend)}
                    </AppText>
                    <AppText variant="caption" style={{ color: withOpacity(theme.onPrimary, Opacity.medium) }}>
                        Available after debt, budgets, and upcoming bills
                    </AppText>
                </View>

                <View style={[styles.divider, { backgroundColor: withOpacity(theme.onPrimary, Opacity.muted) }]} />

                <View style={styles.breakdownGrid}>
                    <View style={[styles.breakdownItem, { backgroundColor: withOpacity(theme.onPrimary, Opacity.soft) }]}>
                        <AppText variant="caption" style={{ color: withOpacity(theme.onPrimary, Opacity.medium) }}>
                            {AppConfig.strings.dashboard.assets}
                        </AppText>
                        <AppText variant="subheading" style={[styles.breakdownValue, { color: theme.onPrimary }]}>
                            {format(totalLiquidAssets)}
                        </AppText>
                    </View>

                    <View style={[styles.breakdownItem, { backgroundColor: withOpacity(theme.onPrimary, Opacity.soft) }]}>
                        <AppText variant="caption" style={{ color: withOpacity(theme.onPrimary, Opacity.medium) }}>
                            {AppConfig.strings.dashboard.debts}
                        </AppText>
                        <AppText variant="subheading" style={[styles.breakdownValue, { color: theme.onPrimary }]}>
                            {format(totalLiabilities)}
                        </AppText>
                    </View>

                    <View style={[styles.breakdownItem, { backgroundColor: withOpacity(theme.onPrimary, Opacity.soft) }]}>
                        <AppText variant="caption" style={{ color: withOpacity(theme.onPrimary, Opacity.medium) }}>
                            {AppConfig.strings.dashboard.budgets}
                        </AppText>
                        <AppText variant="subheading" style={[styles.breakdownValue, { color: theme.onPrimary }]}>
                            {format(committedBudget)}
                        </AppText>
                    </View>

                    <View style={[styles.breakdownItem, { backgroundColor: withOpacity(theme.onPrimary, Opacity.soft) }]}>
                        <AppText variant="caption" style={{ color: withOpacity(theme.onPrimary, Opacity.medium) }}>
                            {AppConfig.strings.dashboard.bills}
                        </AppText>
                        <AppText variant="subheading" style={[styles.breakdownValue, { color: theme.onPrimary }]}>
                            {format(committedRecurring + committedPlanned)}
                        </AppText>
                    </View>
                </View>
            </AppCard>

            <PopupModal
                visible={isInfoVisible}
                title={info.title}
                onClose={() => setInfoVisible(false)}
                maxHeightPercent={84}
                accessibilityCloseLabel="Close safe-to-spend info"
                actions={[
                    {
                        label: info.closeCta,
                        variant: 'primary',
                        onPress: () => setInfoVisible(false),
                    }
                ]}
            >
                <View style={styles.modalSection}>
                    <AppText variant="body">{info.intro}</AppText>
                </View>

                <View style={[styles.modalHighlight, { backgroundColor: theme.surfaceSecondary }]}>
                    <AppText variant="body" weight="medium" color="primary">
                        {info.unlocks}
                    </AppText>
                </View>

                <View style={styles.modalSection}>
                    <AppText variant="heading" style={styles.modalSectionTitle}>{info.formulaTitle}</AppText>
                    {info.formulaItems.map((item, index) => {
                        const [title, content] = item.split(': ');
                        return (
                            <View key={index} style={styles.bulletRow}>
                                <AppIcon name="chevronRight" size={Size.iconXs} color={theme.primary} />
                                <View style={styles.bulletContent}>
                                    <AppText variant="caption" weight="bold">{title}:</AppText>
                                    <AppText variant="caption" color="secondary">{content}</AppText>
                                </View>
                            </View>
                        );
                    })}
                </View>

                <View style={styles.modalSection}>
                    <AppText variant="heading" style={styles.modalSectionTitle}>{info.bucketTitle}</AppText>
                    {renderSubcategoryGroup('Assets bucket', info.formulaItems[0], liquidAssetSubcategories, liquidAssetAccountNames)}
                    {renderSubcategoryGroup('Debts bucket', info.formulaItems[1], liquidLiabilitySubcategories, liquidLiabilityAccountNames)}
                    {renderSubcategoryGroup('Budgets bucket', info.formulaItems[2], budgetSubcategories, budgetAccountNames)}
                    {renderSubcategoryGroup('Bills bucket', info.formulaItems[3], recurringSubcategories, recurringAccountNames)}
                </View>

                <View style={styles.modalSection}>
                    <AppText variant="heading" style={styles.modalSectionTitle}>{info.exampleTitle}</AppText>
                    <View style={[styles.exampleBox, { borderColor: theme.border }]}>
                        <AppText variant="caption" color="secondary">Liquid Assets: {format(totalLiquidAssets)}</AppText>
                        <AppText variant="caption" color="secondary">Liquid Debts: {format(totalLiabilities)}</AppText>
                        <AppText variant="caption" color="secondary">Remaining Budgets: {format(committedBudget)}</AppText>
                        <AppText variant="caption" color="secondary">Recurring Bills & Plans: {format(committedRecurring + committedPlanned)}</AppText>
                        <View style={[styles.snapshotDivider, { backgroundColor: theme.border }]} />
                        <AppText variant="body" weight="bold">Safe to Spend: {format(safeToSpend)}</AppText>
                    </View>
                </View>

                <View style={styles.modalSection}>
                    <AppText variant="heading" style={styles.modalSectionTitle}>{info.benefitsTitle}</AppText>
                    {info.benefits.map((item, index) => {
                        const [title, content] = item.split(': ');
                        return (
                            <View key={index} style={styles.benefitRow}>
                                <AppText variant="body" weight="bold">{title}:</AppText>
                                <AppText variant="body" color="secondary">{content}</AppText>
                            </View>
                        );
                    })}
                </View>

                <View style={styles.modalFooter}>
                    <AppText variant="caption" italic color="secondary">
                        {info.footer}
                    </AppText>
                </View>
            </PopupModal>
        </>
    );
};

const styles = StyleSheet.create({
    container: {
        marginBottom: Spacing.lg,
    },
    kickerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    kickerBadge: {
        width: Size.md,
        height: Size.md,
        borderRadius: Spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    kickerText: {
        letterSpacing: Typography.letterSpacing.wide,
    },
    infoButton: {
        marginLeft: 'auto',
        width: Size.md,
        height: Size.md,
        borderRadius: Spacing.sm,
        alignItems: 'center',
        justifyContent: 'center',
    },
    amountWrap: {
        marginTop: Spacing.md,
        marginBottom: Spacing.lg,
    },
    amount: {
        marginBottom: Spacing.xs,
    },
    divider: {
        height: 1,
        width: '100%',
        marginBottom: Spacing.md,
    },
    breakdownGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: Spacing.sm,
    },
    breakdownItem: {
        width: '48%',
        borderRadius: Spacing.sm,
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.xs,
    },
    breakdownValue: {
        marginTop: Spacing.xs,
    },
    modalHighlight: {
        padding: Spacing.md,
        borderRadius: Shape.radius.md,
    },
    modalSection: {
        gap: Spacing.xs,
    },
    modalSectionTitle: {
        fontSize: Typography.sizes.base,
    },
    modalSectionHint: {
        opacity: Opacity.heavy,
    },
    modalSectionValue: {
        marginTop: Spacing.xs,
    },
    modalMetaGroup: {
        marginTop: Spacing.xs,
    },
    bulletRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: Spacing.xs,
        marginTop: Spacing.xs,
    },
    bulletContent: {
        flex: 1,
        gap: Spacing.xs,
    },
    exampleBox: {
        borderWidth: 1,
        borderRadius: Shape.radius.md,
        padding: Spacing.md,
        gap: Spacing.xs,
        marginTop: Spacing.xs,
    },
    snapshotDivider: {
        height: 1,
        width: '100%',
        marginVertical: Spacing.xs,
    },
    benefitRow: {
        marginTop: Spacing.xs,
    },
    modalFooter: {
        marginTop: Spacing.sm,
        paddingTop: Spacing.md,
    },
});
