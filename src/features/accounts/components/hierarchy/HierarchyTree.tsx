import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { Layout, Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { ACCOUNT_TYPE_ORDER, getAccountTypeColorKey } from '@/src/utils/accountCategory';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

interface HierarchyTreeProps {
    accounts: Account[];
    balancesByAccountId: Map<string, { transactionCount?: number; directTransactionCount?: number }>;
    selectedAccountId: string | null;
    collapsedCategories: Set<string>;
    expandedAccountIds: Set<string>;
    accountsByParent: Map<string | null, Account[]>;
    visibleRootAccountsByCategory: Record<string, Account[]>;
    onCreateParent: () => void;
    onSelectAccount: (accountId: string | null) => void;
    onToggleExpand: (accountId: string) => void;
    onToggleCategory: (category: string) => void;
    onAssignParent: (accountId: string, parentId: string | null) => Promise<void>;
}

export function HierarchyTree({
    accounts,
    balancesByAccountId,
    selectedAccountId,
    collapsedCategories,
    expandedAccountIds,
    accountsByParent,
    visibleRootAccountsByCategory,
    onCreateParent,
    onSelectAccount,
    onToggleExpand,
    onToggleCategory,
    onAssignParent,
}: HierarchyTreeProps) {
    const { theme } = useTheme();

    const renderAccountItem = (accountId: string, level = 0) => {
        const account = accounts.find((candidate) => candidate.id === accountId);
        if (!account) return null;

        const balance = balancesByAccountId.get(account.id);
        const children = accountsByParent.get(account.id) || [];
        const hasChildren = children.length > 0;
        const isExpanded = expandedAccountIds.has(account.id);
        const canBeParent = (balance?.directTransactionCount || 0) === 0;
        const isExpandable = hasChildren || canBeParent;
        const isSelected = selectedAccountId === account.id;
        const categoryColor = theme[getAccountTypeColorKey(account.accountType)];

        return (
            <View key={account.id}>
                <View
                    style={[
                        styles.accountRowContainer,
                        isSelected && { backgroundColor: theme.surfaceSecondary },
                        hasChildren && { backgroundColor: withOpacity(categoryColor, Opacity.hover) },
                    ]}
                >
                    <View style={[styles.indentationGuide, { width: level * Layout.hierarchy.indentWidth }]}> 
                        {level > 0 &&
                            Array.from({ length: level }).map((_, index) => (
                                <View
                                    key={index}
                                    style={[
                                        styles.verticalGuide,
                                        {
                                            left: index * Layout.hierarchy.indentWidth + Layout.hierarchy.guideOffset,
                                            borderLeftColor: theme.divider,
                                            opacity: index === level - 1 ? Opacity.solid : Opacity.muted,
                                        },
                                    ]}
                                />
                            ))}
                    </View>

                    <TouchableOpacity
                        style={styles.accountRowContent}
                        onPress={() => isExpandable && onToggleExpand(account.id)}
                        disabled={!isExpandable}
                    >
                        {hasChildren && (
                            <View
                                style={{
                                    width: Layout.hierarchy.parentIndicator.width,
                                    height: Layout.hierarchy.parentIndicator.height,
                                    backgroundColor: categoryColor,
                                    marginRight: Layout.hierarchy.parentIndicator.marginRight,
                                    borderRadius: Layout.hierarchy.parentIndicator.borderRadius,
                                }}
                            />
                        )}

                        {isExpandable ? (
                            <TouchableOpacity onPress={() => onToggleExpand(account.id)} style={styles.expandButton}>
                                <AppIcon
                                    name={isExpanded ? 'chevronDown' : 'chevronRight'}
                                    size={Size.iconXs}
                                    color={theme.textTertiary}
                                />
                            </TouchableOpacity>
                        ) : (
                            <View style={styles.expandPlaceholder} />
                        )}

                        <View style={styles.iconWrapper}>
                            <AppIcon name={account.icon} fallbackIcon="wallet" size={Size.iconSm} color={categoryColor} />
                        </View>

                        <View style={styles.accountText}>
                            <View style={styles.inlineRow}>
                                <AppText variant="body" weight={hasChildren ? 'bold' : 'regular'} style={{ color: theme.text }}>
                                    {account.name}
                                </AppText>
                                {!canBeParent && (
                                    <View style={{ marginTop: Spacing.xs / 2 }}>
                                        <AppIcon name="receipt" size={Typography.sizes.sm} color={theme.textTertiary} />
                                    </View>
                                )}
                            </View>
                        </View>

                        <View style={styles.rowActions}>
                            <TouchableOpacity
                                style={[styles.actionIconButton, { backgroundColor: withOpacity(theme.primary, Opacity.hover) }]}
                                onPress={() => onSelectAccount(account.id)}
                            >
                                <AppIcon name="reorder" size={Size.iconXs} color={theme.primary} />
                                <AppText variant="caption" color="primary" weight="bold">
                                    MOVE
                                </AppText>
                            </TouchableOpacity>

                            {account.parentAccountId && (
                                <TouchableOpacity
                                    style={[styles.actionIconButton, { backgroundColor: withOpacity(theme.error, Opacity.hover) }]}
                                    onPress={() => void onAssignParent(account.id, null)}
                                    accessibilityLabel="Move to top level"
                                >
                                    <AppIcon name="eject" size={Size.iconXs} color={theme.error} />
                                </TouchableOpacity>
                            )}
                        </View>
                    </TouchableOpacity>
                </View>

                {isExpanded && (hasChildren || canBeParent) && (
                    <View>
                        {canBeParent && (
                            <View style={styles.accountRowContainer}>
                                <View style={[styles.indentationGuide, { width: (level + 1) * Layout.hierarchy.indentWidth }]}> 
                                    {Array.from({ length: level + 1 }).map((_, index) => (
                                        <View
                                            key={index}
                                            style={[
                                                styles.verticalGuide,
                                                {
                                                    left: index * Layout.hierarchy.indentWidth + Layout.hierarchy.guideOffset,
                                                    borderLeftColor: theme.divider,
                                                },
                                            ]}
                                        />
                                    ))}
                                </View>
                                <TouchableOpacity style={styles.accountRowContent} onPress={() => onSelectAccount(account.id)}>
                                    <View style={styles.expandPlaceholder} />
                                    <View style={styles.iconWrapper}>
                                        <AppIcon name="plusCircle" size={Size.iconXs} color={theme.success} />
                                    </View>
                                    <View style={styles.accountText}>
                                        <AppText variant="body" color="success" weight="bold">
                                            {AppConfig.strings.accounts.hierarchy.addChild}
                                        </AppText>
                                    </View>
                                </TouchableOpacity>
                            </View>
                        )}

                        {children.map((child) => renderAccountItem(child.id, level + 1))}
                    </View>
                )}
            </View>
        );
    };

    return (
        <>
            <View style={styles.header}>
                <AppText variant="body" color="secondary">
                    {AppConfig.strings.accounts.hierarchy.description}
                </AppText>
                <AppButton onPress={onCreateParent} variant="secondary" style={styles.newButton}>
                    {AppConfig.strings.accounts.hierarchy.newParentButton}
                </AppButton>
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent}>
                {Object.entries(visibleRootAccountsByCategory).map(([category, categoryAccounts]) => {
                    if (categoryAccounts.length === 0) return null;
                    const isCollapsed = collapsedCategories.has(category);

                    return (
                        <View key={category} style={styles.categorySection}>
                            <TouchableOpacity
                                activeOpacity={Opacity.heavy}
                                onPress={() => onToggleCategory(category)}
                                style={[
                                    styles.categoryHeader,
                                    {
                                        backgroundColor: theme.surface,
                                        borderTopWidth: category === ACCOUNT_TYPE_ORDER[0] ? 0 : 1,
                                        borderTopColor: theme.divider,
                                        marginTop: category === ACCOUNT_TYPE_ORDER[0] ? 0 : Spacing.lg,
                                    },
                                ]}
                            >
                                <AppText variant="caption" weight="bold" color="secondary" style={styles.categoryTitle}>
                                    {category}
                                </AppText>
                                <AppIcon
                                    name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                                    size={Size.iconXs}
                                    color={theme.textTertiary}
                                />
                            </TouchableOpacity>

                            {!isCollapsed && categoryAccounts.map((account) => renderAccountItem(account.id, 0))}
                        </View>
                    );
                })}
            </ScrollView>
        </>
    );
}

const styles = StyleSheet.create({
    header: {
        padding: Spacing.lg,
        gap: Spacing.md,
    },
    newButton: {
        alignSelf: 'flex-start',
    },
    scrollContent: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.xxxxl,
    },
    accountRowContainer: {
        flexDirection: 'row',
        alignItems: 'stretch',
    },
    indentationGuide: {
        flexDirection: 'row',
        alignSelf: 'stretch',
        position: 'relative',
    },
    verticalGuide: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        width: StyleSheet.hairlineWidth,
        borderLeftWidth: StyleSheet.hairlineWidth,
        opacity: Opacity.medium,
    },
    accountRowContent: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        minHeight: Size.touchTarget,
        paddingVertical: Spacing.md,
    },
    expandButton: {
        width: Size.lg,
        alignSelf: 'stretch',
        justifyContent: 'center',
        alignItems: 'center',
    },
    expandPlaceholder: {
        width: Size.lg,
    },
    iconWrapper: {
        width: Size.lg,
        alignItems: 'center',
        justifyContent: 'center',
    },
    accountText: {
        flex: 1,
    },
    inlineRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    rowActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    actionIconButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.sm,
        borderRadius: Shape.radius.sm,
        gap: Spacing.xs,
    },
    categorySection: {
        marginBottom: Spacing.md,
    },
    categoryHeader: {
        paddingHorizontal: Spacing.sm,
        paddingVertical: Spacing.md,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    categoryTitle: {
        letterSpacing: Typography.letterSpacing.wide * 3,
        textTransform: 'uppercase',
        flex: 1,
    },
});
