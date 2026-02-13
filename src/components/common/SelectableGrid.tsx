import { AppButton, AppIcon, AppInput, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { AppConfig, Layout, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback, useMemo, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export interface SelectableItem {
    id?: string;
    name: string;
    icon?: IconName;
    symbol?: string;
    color?: string;
    subtitle?: string;
}

export interface CustomItemInput {
    placeholder: string;
    onAdd: (name: string, type: 'INCOME' | 'EXPENSE', icon: IconName) => void;
    defaultIcon?: IconName;
    showTypeToggle?: boolean;
    typeLabels?: { income: string; expense: string };
}

export interface SelectableGridProps {
    title: string;
    subtitle: string;
    items: SelectableItem[];
    selectedIds: string[];
    onToggle: (id: string) => void;
    onContinue: () => void;
    onBack: () => void;
    isCompleting: boolean;
    maxSelection?: number;
    showSearch?: boolean;
    searchPlaceholder?: string;
    renderIcon?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
    renderSubtitle?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
    accentColor?: string;
    footerActionLabel?: string;
    customInput?: CustomItemInput | null;
}

export const SelectableGrid: React.FC<SelectableGridProps> = ({
    title,
    subtitle,
    items,
    selectedIds,
    onToggle,
    onContinue,
    onBack,
    isCompleting,
    maxSelection,
    showSearch = false,
    searchPlaceholder = 'Search...',
    renderIcon,
    renderSubtitle,
    accentColor,
    footerActionLabel = 'Continue',
    customInput,
}) => {
    const { theme } = useTheme();
    const [searchQuery, setSearchQuery] = useState('');
    const [customName, setCustomName] = useState('');
    const [customType, setCustomType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
    const [selectedIcon, setSelectedIcon] = useState<IconName>('tag');
    const [isIconPickerVisible, setIsIconPickerVisible] = useState(false);
    const effectiveAccentColor = accentColor || theme.primary;

    const filteredItems = useMemo(() => {
        if (!searchQuery.trim()) return items;
        const query = searchQuery.toLowerCase();
        return items.filter(item =>
            item.name.toLowerCase().includes(query) ||
            item.subtitle?.toLowerCase().includes(query)
        );
    }, [items, searchQuery]);

    const handleToggle = useCallback((id: string) => {
        if (maxSelection && selectedIds.length >= maxSelection && !selectedIds.includes(id)) {
            return;
        }
        onToggle(id);
    }, [maxSelection, onToggle, selectedIds]);

    const handleAddCustom = useCallback(() => {
        if (!customName.trim() || !customInput) return;
        const type = customInput.showTypeToggle ? customType : 'EXPENSE';
        customInput.onAdd(customName.trim(), type, selectedIcon);
        setCustomName('');
        setSelectedIcon(customInput.defaultIcon || 'tag');
    }, [customName, customInput, selectedIcon, customType]);

    const handleTypeChange = useCallback((type: 'INCOME' | 'EXPENSE') => {
        setCustomType(type);
        if (customInput?.showTypeToggle) {
            setSelectedIcon(type === 'EXPENSE' ? (customInput.defaultIcon || 'tag') : (customInput.defaultIcon || 'trendingUp'));
        }
    }, [customInput]);

    const renderItem = useCallback(({ item }: { item: SelectableItem }) => {
        const itemId = item.id ?? item.name;
        const isSelected = selectedIds.includes(itemId);
        const isAtMax = maxSelection !== undefined && selectedIds.length >= maxSelection && !isSelected;

        return (
            <TouchableOpacity
                style={[
                    styles.item,
                    {
                        backgroundColor: isSelected ? withOpacity(effectiveAccentColor, Opacity.selection) : theme.surface,
                        borderColor: isSelected ? effectiveAccentColor : theme.border,
                    }
                ]}
                onPress={() => handleToggle(itemId)}
                disabled={isAtMax}
                activeOpacity={Opacity.heavy}
                accessibilityLabel={`${item.name}, ${isSelected ? 'selected' : 'not selected'}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected, disabled: isAtMax }}
            >
                <View style={styles.itemHeader}>
                    <View style={[
                        styles.iconContainer,
                        { backgroundColor: isSelected ? withOpacity(effectiveAccentColor, Opacity.soft) : theme.background }
                    ]}>
                        {renderIcon ? (
                            renderIcon(item, isSelected)
                        ) : item.icon ? (
                            <AppIcon
                                name={item.icon}
                                size={Size.iconMd}
                                color={isSelected ? effectiveAccentColor : theme.text}
                            />
                        ) : item.symbol ? (
                            <AppText
                                variant="heading"
                                style={{ color: isSelected ? effectiveAccentColor : theme.text }}
                            >
                                {item.symbol}
                            </AppText>
                        ) : null}
                    </View>
                    {isSelected && (
                        <AppIcon name="checkCircle" size={Size.iconMd} color={effectiveAccentColor} />
                    )}
                </View>

                <View style={styles.itemContent}>
                    <AppText
                        variant="subheading"
                        style={{ color: isSelected ? effectiveAccentColor : theme.text }}
                        numberOfLines={1}
                    >
                        {item.name}
                    </AppText>
                    {renderSubtitle ? (
                        renderSubtitle(item, isSelected)
                    ) : item.subtitle ? (
                        <AppText
                            variant="caption"
                            color="secondary"
                            style={{ color: isSelected ? withOpacity(effectiveAccentColor, 0.8) : theme.textSecondary }}
                        >
                            {item.subtitle}
                        </AppText>
                    ) : null}
                </View>
            </TouchableOpacity>
        );
    }, [selectedIds, theme, effectiveAccentColor, maxSelection, renderIcon, renderSubtitle, handleToggle]);

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.container}
            keyboardVerticalOffset={Platform.OS === 'android' ? Layout.keyboardOffset.android : 0}
        >
            <View style={styles.header}>
                <AppText variant="title" style={styles.title}>
                    {title}
                </AppText>
                <AppText variant="body" color="secondary" style={styles.subtitle}>
                    {subtitle}
                </AppText>
            </View>

            <ScrollView
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                <View style={styles.grid}>
                    {filteredItems.map((item) => (
                        <View key={item.id ?? item.name} style={styles.itemWrapper}>
                            {renderItem({ item })}
                        </View>
                    ))}
                </View>
            </ScrollView>

            {(customInput || showSearch) && (
                <View style={styles.bottomInputSection}>
                    {customInput && (
                        <View style={styles.customInputContainer}>
                            <View style={styles.inputRow}>
                                <TouchableOpacity
                                    style={[styles.iconButton, { backgroundColor: theme.surface, borderColor: theme.border }]}
                                    onPress={() => setIsIconPickerVisible(true)}
                                    accessibilityLabel="Select icon"
                                    accessibilityRole="button"
                                >
                                    <AppIcon name={selectedIcon} size={Size.sm} color={theme.primary} />
                                </TouchableOpacity>

                                <AppInput
                                    placeholder={customInput.placeholder}
                                    value={customName}
                                    onChangeText={setCustomName}
                                    containerStyle={styles.customInput}
                                    accessibilityLabel="Custom item name"
                                    onSubmitEditing={handleAddCustom}
                                />

                                <TouchableOpacity
                                    style={[styles.addButton, { backgroundColor: customName.trim() ? theme.primary : theme.border }]}
                                    onPress={handleAddCustom}
                                    disabled={!customName.trim()}
                                    accessibilityLabel="Add custom item"
                                    accessibilityRole="button"
                                    accessibilityState={{ disabled: !customName.trim() }}
                                >
                                    <AppIcon name="add" size={Size.sm} color={theme.surface} />
                                </TouchableOpacity>
                            </View>

                            {customInput.showTypeToggle && (
                                <View style={styles.typeToggle}>
                                    <TouchableOpacity
                                        onPress={() => handleTypeChange('EXPENSE')}
                                        style={[
                                            styles.typeButton,
                                            customType === 'EXPENSE' && { backgroundColor: withOpacity(theme.error, Opacity.soft), borderColor: theme.error }
                                        ]}
                                    >
                                        <AppText variant="caption" style={{ color: customType === 'EXPENSE' ? theme.error : theme.textSecondary }}>
                                            {customInput.typeLabels?.expense || 'Expense'}
                                        </AppText>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => handleTypeChange('INCOME')}
                                        style={[
                                            styles.typeButton,
                                            customType === 'INCOME' && { backgroundColor: withOpacity(theme.success, Opacity.soft), borderColor: theme.success }
                                        ]}
                                    >
                                        <AppText variant="caption" style={{ color: customType === 'INCOME' ? theme.success : theme.textSecondary }}>
                                            {customInput.typeLabels?.income || 'Income'}
                                        </AppText>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    )}

                    {showSearch && (
                        <View style={styles.searchContainer}>
                            <AppInput
                                placeholder={searchPlaceholder}
                                value={searchQuery}
                                onChangeText={setSearchQuery}
                                containerStyle={styles.searchBar}
                                accessibilityLabel="Search"
                            />
                        </View>
                    )}
                </View>
            )}

            {isIconPickerVisible && customInput && (
                <IconPickerModal
                    visible={isIconPickerVisible}
                    onClose={() => setIsIconPickerVisible(false)}
                    onSelect={(icon) => setSelectedIcon(icon)}
                    selectedIcon={selectedIcon}
                />
            )}

            <View style={styles.footer}>
                <AppButton
                    variant="primary"
                    size="lg"
                    onPress={onContinue}
                    disabled={isCompleting}
                    style={styles.continueButton}
                >
                    {footerActionLabel}
                </AppButton>
                <AppButton
                    variant="ghost"
                    size="md"
                    onPress={onBack}
                    disabled={isCompleting}
                >
                    Back
                </AppButton>
            </View>
        </KeyboardAvoidingView>
    );
};

const IconPickerModal: React.FC<{
    visible: boolean;
    onClose: () => void;
    onSelect: (icon: IconName) => void;
    selectedIcon: IconName;
}> = ({ visible, onClose, onSelect, selectedIcon }) => {
    const { theme } = useTheme();
    const icons: IconName[] = [
        'tag', 'trendingUp', 'shoppingCart', 'coffee', 'bus', 'film',
        'shoppingBag', 'document', 'home', 'wallet', 'bank', 'safe', 'creditCard',
        'briefcase', 'circle', 'copy', 'receipt', 'calendar', 'search',
        'edit', 'delete', 'arrowUp', 'arrowDown', 'swapHorizontal'
    ];

    const { strings } = AppConfig;

    return (
        <Modal visible={visible} transparent animationType="fade">
            <Pressable style={[styles.modalOverlay, { backgroundColor: theme.overlay }]} onPress={onClose}>
                <View style={[styles.modalContent, { backgroundColor: theme.surface }]}>
                    <AppText variant="subheading" style={styles.modalTitle}>{strings.onboarding.iconPickerTitle}</AppText>
                    <View style={styles.iconGrid}>
                        {icons.map((icon) => (
                            <TouchableOpacity
                                key={icon}
                                style={[
                                    styles.modalIconButton,
                                    { backgroundColor: selectedIcon === icon ? withOpacity(theme.primary, Opacity.soft) : 'transparent' }
                                ]}
                                onPress={() => {
                                    onSelect(icon);
                                    onClose();
                                }}
                            >
                                <AppIcon name={icon} size={Size.iconLg} color={selectedIcon === icon ? theme.primary : theme.text} />
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Pressable>
        </Modal>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    header: {
        alignItems: 'center',
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.md,
    },
    title: {
        textAlign: 'center',
        marginBottom: Spacing.xs,
    },
    subtitle: {
        textAlign: 'center',
        paddingHorizontal: Spacing.xl,
    },
    customInputContainer: {
        marginBottom: Spacing.md,
        gap: Spacing.sm,
    },
    inputRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    customInput: {
        flex: 1,
        marginBottom: 0,
    },
    iconButton: {
        width: Size.inputMd,
        height: Size.inputMd,
        borderRadius: Shape.radius.r2,
        borderWidth: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    addButton: {
        width: Size.inputMd,
        height: Size.inputMd,
        borderRadius: Size.inputMd / 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    typeToggle: {
        flexDirection: 'row',
        gap: Spacing.sm,
        paddingLeft: Size.inputMd + Spacing.sm,
    },
    typeButton: {
        paddingVertical: 4,
        paddingHorizontal: Spacing.md,
        borderRadius: Shape.radius.r3,
        borderWidth: 1,
    },
    searchContainer: {
        marginBottom: Spacing.md,
    },
    searchBar: {
        marginBottom: 0,
    },
    scrollContainer: {
        flex: 1,
    },
    scrollContent: {
        paddingBottom: Spacing.xl,
        paddingHorizontal: Spacing.xs,
    },
    grid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginHorizontal: -Spacing.xs,
    },
    itemWrapper: {
        width: '46%',
        margin: '2%',
    },
    item: {
        borderRadius: Shape.radius.r3,
        borderWidth: 1.5,
        padding: Spacing.md,
        minHeight: Layout.touchTarget.minHeight,
        justifyContent: 'space-between',
    },
    itemHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: Spacing.md,
    },
    iconContainer: {
        width: Size.xl,
        height: Size.xl,
        borderRadius: Size.xl / 2,
        justifyContent: 'center',
        alignItems: 'center',
    },
    itemContent: {
        gap: Spacing.xs / 2,
    },
    footer: {
        paddingTop: Spacing.lg,
        paddingBottom: Spacing.lg,
        gap: Spacing.sm,
    },
    continueButton: {
        width: '100%',
    },
    bottomInputSection: {
        paddingTop: Spacing.md,
        paddingHorizontal: Spacing.lg,
    },
    modalOverlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        borderRadius: Shape.radius.r3,
        padding: Spacing.lg,
        width: '80%',
        maxHeight: '60%',
    },
    modalTitle: {
        marginBottom: Spacing.md,
        textAlign: 'center',
    },
    iconGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: Spacing.sm,
    },
    modalIconButton: {
        width: Size.xxl,
        height: Size.xxl,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: Shape.radius.r2,
    },
});
