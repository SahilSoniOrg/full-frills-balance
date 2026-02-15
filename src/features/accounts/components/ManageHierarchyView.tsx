import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { Screen } from '@/src/components/layout';
import { Layout, Opacity, Shape, Size, Spacing, Typography, withOpacity } from '@/src/constants';
import { AppConfig } from '@/src/constants/app-config';
import { AccountType } from '@/src/data/models/Account';
import { ManageHierarchyViewModel } from '@/src/features/accounts/hooks/useManageHierarchyViewModel';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export function ManageHierarchyView(vm: ManageHierarchyViewModel) {
    const { theme } = useTheme();
    const {
        accounts,
        balancesByAccountId,
        selectedAccountId,
        selectedAccount,
        collapsedCategories,
        expandedAccountIds,
        accountsByParent,
        visibleRootAccountsByCategory,
        canSelectedAccountBeParent,
        addChildCandidates,
        parentCandidates,
        onCreateParent,
        onSelectAccount,
        onToggleExpand,
        onToggleCategory,
        onAssignParent,
        onAddChild,
    } = vm;

    const renderAccountItem = (accountId: string, level = 0) => {
        const account = accounts.find((candidate) => candidate.id === accountId);
        if (!account) return null;

        const balance = balancesByAccountId.get(account.id);
        const children = accountsByParent.get(account.id) || [];
        const hasChildren = children.length > 0;
        const isExpanded = expandedAccountIds.has(account.id);
        const canBeParent = (balance?.transactionCount || 0) === 0;
        const isExpandable = hasChildren || canBeParent;
        const isSelected = selectedAccountId === account.id;
        const accountTypeKey = account.accountType.toLowerCase() as keyof typeof theme;
        const categoryColor = (theme as unknown as Record<string, string>)[accountTypeKey] || theme.text;

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
        <Screen title={AppConfig.strings.accounts.hierarchy.title}>
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
                                        borderTopWidth: category === AccountType.ASSET ? 0 : 1,
                                        borderTopColor: theme.divider,
                                        marginTop: category === AccountType.ASSET ? 0 : Spacing.lg,
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

            <Modal
                visible={!!selectedAccountId}
                transparent
                animationType="fade"
                onRequestClose={() => onSelectAccount(null)}
            >
                <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={() => onSelectAccount(null)}>
                    <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                        <View style={styles.modalHeader}>
                            <AppText variant="subheading" weight="bold">
                                {AppConfig.strings.accounts.hierarchy.modalTitle}
                            </AppText>
                            <AppText variant="caption" color="secondary">
                                {AppConfig.strings.accounts.hierarchy.modalDescription(selectedAccount?.name || '')}
                            </AppText>
                        </View>

                        <ScrollView style={styles.modalScroll}>
                            {canSelectedAccountBeParent && (
                                <View style={styles.destinationSection}>
                                    <AppText variant="caption" weight="bold" style={styles.sectionLabel}>
                                        {AppConfig.strings.accounts.hierarchy.addChildrenLabel}
                                    </AppText>
                                    {addChildCandidates.map((candidate) => (
                                        <TouchableOpacity
                                            key={candidate.id}
                                            style={[styles.destinationItem, { borderBottomColor: theme.divider }]}
                                            onPress={() => selectedAccountId && void onAddChild(selectedAccountId, candidate.id)}
                                        >
                                            <AppIcon
                                                name={candidate.icon}
                                                fallbackIcon="wallet"
                                                size={Size.iconSm}
                                                color={theme.textSecondary}
                                            />
                                            <View style={{ flex: 1 }}>
                                                <AppText variant="body">{candidate.name}</AppText>
                                                {(balancesByAccountId.get(candidate.id)?.transactionCount || 0) > 0 && (
                                                    <AppText variant="caption" color="secondary">
                                                        {AppConfig.strings.accounts.hierarchy.hasTransactions}
                                                    </AppText>
                                                )}
                                            </View>
                                            <AppIcon name="add" size={Size.iconXs} color={theme.success} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            <View style={styles.destinationSection}>
                                <AppText variant="caption" weight="bold" style={styles.sectionLabel}>
                                    {AppConfig.strings.accounts.hierarchy.moveParentLabel}
                                </AppText>
                                {parentCandidates.map((candidate) => (
                                    <TouchableOpacity
                                        key={candidate.id}
                                        style={[styles.destinationItem, { borderBottomColor: theme.divider }]}
                                        onPress={() => selectedAccountId && void onAssignParent(selectedAccountId, candidate.id)}
                                    >
                                        <AppIcon
                                            name={candidate.icon}
                                            fallbackIcon="wallet"
                                            size={Size.iconSm}
                                            color={theme.textSecondary}
                                        />
                                        <AppText variant="body" style={{ flex: 1 }}>
                                            {candidate.name}
                                        </AppText>
                                        {selectedAccount?.parentAccountId === candidate.id && (
                                            <AppIcon name="check" size={Size.iconSm} color={theme.success} />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>

                        <AppButton onPress={() => onSelectAccount(null)} variant="ghost" style={styles.cancelButton}>
                            {AppConfig.strings.common.cancel}
                        </AppButton>
                    </View>
                </Pressable>
            </Modal>
        </Screen>
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
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    modalContent: {
        borderTopLeftRadius: Shape.radius.r2,
        borderTopRightRadius: Shape.radius.r2,
        padding: Spacing.lg,
        maxHeight: AppConfig.layout.hierarchyModalHeightPercent,
    },
    modalHeader: {
        marginBottom: Spacing.lg,
    },
    modalScroll: {
        marginBottom: Spacing.md,
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
    destinationItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: Spacing.lg,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: Spacing.md,
    },
    destinationSection: {
        marginTop: Spacing.lg,
    },
    sectionLabel: {
        letterSpacing: Typography.letterSpacing.wide * 2,
        marginBottom: Spacing.sm,
    },
    cancelButton: {
        marginTop: Spacing.sm,
    },
});
