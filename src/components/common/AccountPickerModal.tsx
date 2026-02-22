import { AppIcon, AppText, ListRow } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountSections, getAccountVariant, getSectionColor } from '@/src/utils/accountCategory';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal, SectionList, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

interface AccountPickerModalProps {
    visible: boolean;
    accounts: Account[];
    selectedId?: string;
    title?: string;
    onClose: () => void;
    onSelect: (accountId: string) => void;
}

export function AccountPickerModal({
    visible,
    accounts,
    selectedId: initialSelectedId,
    title = 'Select Account',
    onClose,
    onSelect,
}: AccountPickerModalProps) {
    const { theme } = useTheme();
    const [selectedId, setSelectedId] = useState(initialSelectedId || '');
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

    useEffect(() => {
        setSelectedId(initialSelectedId || '');
    }, [initialSelectedId]);

    const leafAccounts = useMemo(() => {
        const parentIds = new Set(accounts.map((a) => a.parentAccountId).filter(Boolean) as string[]);
        return accounts.filter((a) => !parentIds.has(a.id));
    }, [accounts]);

    const sections = useMemo(() => getAccountSections(leafAccounts), [leafAccounts]);

    const handleSelect = useCallback(
        (id: string) => {
            setSelectedId(id);
            onSelect(id);
        },
        [onSelect],
    );

    const toggleSection = useCallback((sectionTitle: string) => {
        setCollapsedSections((prev) => {
            const next = new Set(prev);
            if (next.has(sectionTitle)) {
                next.delete(sectionTitle);
            } else {
                next.add(sectionTitle);
            }
            return next;
        });
    }, []);

    const getAccountColor = (type: string) => {
        const variant = getAccountVariant(type);
        if (variant === 'asset') return theme.asset;
        if (variant === 'liability') return theme.liability;
        if (variant === 'equity') return theme.equity;
        if (variant === 'income') return theme.income;
        if (variant === 'expense') return theme.expense;
        return theme.primary;
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="slide"
            onRequestClose={onClose}
            statusBarTranslucent
            hardwareAccelerated
        >
            <TouchableWithoutFeedback onPress={onClose}>
                <View style={[styles.modalOverlay, { backgroundColor: theme.overlay }]}>
                    <TouchableWithoutFeedback>
                        <View style={[styles.modalContent, { backgroundColor: theme.background }]}>
                            <View style={[styles.modalHeader, { borderBottomColor: theme.border }]}>
                                <AppText variant="heading">{title}</AppText>
                                <TouchableOpacity onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
                                    <AppText variant="body" color="secondary" style={{ padding: Spacing.sm }}>
                                        ✕
                                    </AppText>
                                </TouchableOpacity>
                            </View>

                            <SectionList
                                sections={sections}
                                keyExtractor={(item) => item.id}
                                stickySectionHeadersEnabled={false}
                                renderSectionHeader={({ section: { title: sectionTitle } }) => {
                                    const isCollapsed = collapsedSections.has(sectionTitle);
                                    const color = getSectionColor(sectionTitle, theme);
                                    return (
                                        <TouchableOpacity
                                            onPress={() => toggleSection(sectionTitle)}
                                            activeOpacity={Opacity.heavy}
                                            style={styles.sectionHeader}
                                        >
                                            <View style={styles.sectionTitleRow}>
                                                <View style={[styles.sectionDot, { backgroundColor: color }]} />
                                                <AppText variant="subheading" weight="bold" color="secondary">
                                                    {sectionTitle}
                                                </AppText>
                                            </View>
                                            <AppIcon
                                                name={isCollapsed ? 'chevronRight' : 'chevronDown'}
                                                size={Size.iconSm}
                                                color={theme.textSecondary}
                                            />
                                        </TouchableOpacity>
                                    );
                                }}
                                renderItem={({ item, section }) => {
                                    if (collapsedSections.has(section.title)) return null;

                                    const isSelected = item.id === selectedId;
                                    const accountColor = getAccountColor(item.accountType);

                                    return (
                                        <ListRow
                                            title={item.name}
                                            titleColor={getAccountVariant(item.accountType)}
                                            subtitle={`${item.accountType} • ${item.currencyCode}`}
                                            onPress={() => handleSelect(item.id)}
                                            style={[
                                                styles.accountRow,
                                                {
                                                    backgroundColor: theme.surface,
                                                    borderColor: isSelected ? accountColor : theme.border,
                                                    borderWidth: isSelected ? 2 : 1,
                                                },
                                            ]}
                                            padding="md"
                                        />
                                    );
                                }}
                                contentContainerStyle={styles.accountsListContent}
                                style={styles.accountsList}
                            />
                        </View>
                    </TouchableWithoutFeedback>
                </View>
            </TouchableWithoutFeedback>
        </Modal>
    );
}

const styles = StyleSheet.create({
    modalOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
        ...StyleSheet.absoluteFillObject,
    },
    modalContent: {
        borderTopLeftRadius: Shape.radius.r2,
        borderTopRightRadius: Shape.radius.r2,
        maxHeight: '80%',
        width: '100%',
        elevation: 5,
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: Spacing.lg,
        borderBottomWidth: 1,
    },
    sectionHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: Spacing.md,
        paddingHorizontal: Spacing.xs,
        marginTop: Spacing.sm,
    },
    sectionTitleRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    sectionDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    accountRow: {
        borderWidth: 1,
        borderRadius: Shape.radius.r3,
        marginBottom: Spacing.sm,
    },
    accountsList: {
        flexGrow: 0,
    },
    accountsListContent: {
        paddingHorizontal: Spacing.md,
        paddingBottom: Spacing.xl * 2,
    },
});
