import { AppIcon, AppText, ListRow } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing } from '@/src/constants';
import Account from '@/src/data/models/Account';
import { useTheme } from '@/src/hooks/use-theme';
import { getAccountSections, getAccountVariant, getSectionColor } from '@/src/utils/accountUtils';
import { journalPresenter } from '@/src/utils/journalPresenter';
import React, { useMemo, useState } from 'react';
import { Modal, SectionList, StyleSheet, TouchableOpacity, TouchableWithoutFeedback, View } from 'react-native';

interface AccountSelectorProps {
    visible: boolean;
    accounts: Account[];
    selectedId?: string;
    onClose: () => void;
    onSelect: (accountId: string) => void;
}

export function AccountSelector({
    visible,
    accounts,
    selectedId,
    onClose,
    onSelect,
}: AccountSelectorProps) {
    const { theme } = useTheme();
    const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

    const sections = useMemo(() => {
        return getAccountSections(accounts);
    }, [accounts]);

    const toggleSection = (title: string) => {
        setCollapsedSections(prev => {
            const next = new Set(prev);
            if (next.has(title)) {
                next.delete(title);
            } else {
                next.add(title);
            }
            return next;
        });
    };

    const getAccountColor = (type: string) => {
        const key = journalPresenter.getAccountColorKey(type);
        return (theme as any)[key] || theme.primary;
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
                                <AppText variant="heading">Select Account</AppText>
                                <TouchableOpacity onPress={onClose} accessibilityLabel="Close" accessibilityRole="button">
                                    <AppText variant="body" color="secondary" style={{ padding: Spacing.sm }}>✕</AppText>
                                </TouchableOpacity>
                            </View>

                            <SectionList
                                sections={sections}
                                keyExtractor={(item) => item.id}
                                stickySectionHeadersEnabled={false}
                                renderSectionHeader={({ section: { title } }) => {
                                    const isCollapsed = collapsedSections.has(title);
                                    const color = getSectionColor(title, theme);
                                    return (
                                        <TouchableOpacity
                                            onPress={() => toggleSection(title)}
                                            activeOpacity={Opacity.heavy}
                                            style={styles.sectionHeader}
                                        >
                                            <View style={styles.sectionTitleRow}>
                                                <View style={[styles.sectionDot, { backgroundColor: color }]} />
                                                <AppText variant="subheading" weight="bold" color="secondary">
                                                    {title}
                                                </AppText>
                                            </View>
                                            <AppIcon
                                                name={isCollapsed ? "chevronRight" : "chevronDown"}
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
                                            onPress={() => onSelect(item.id)}
                                            style={[styles.accountRow, {
                                                backgroundColor: theme.surface,
                                                borderColor: isSelected ? accountColor : theme.border,
                                                borderWidth: isSelected ? 2 : 1,
                                            }]}
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
        elevation: 5, // Android shadow
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
        paddingBottom: Spacing.xl * 2, // Extra padding for safe area/bottom nav
    },
});
