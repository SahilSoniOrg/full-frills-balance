import { AppButton, AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Layout, Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback } from 'react';
import { FlatList, StyleSheet, TouchableOpacity, View } from 'react-native';

export interface SelectableItem {
    id?: string;
    name: string;
    icon?: IconName;
    symbol?: string;
    color?: string;
    subtitle?: string;
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
    renderIcon?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
    renderSubtitle?: (item: SelectableItem, isSelected: boolean) => React.ReactNode;
    accentColor?: string;
    footerActionLabel?: string;
    bottomContent?: React.ReactNode;
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
    renderIcon,
    renderSubtitle,
    accentColor,
    footerActionLabel = 'Continue',
    bottomContent,
}) => {
    const { theme } = useTheme();
    const effectiveAccentColor = accentColor || theme.primary;

    const handleToggle = useCallback((id: string) => {
        if (maxSelection && selectedIds.length >= maxSelection && !selectedIds.includes(id)) {
            return;
        }
        onToggle(id);
    }, [maxSelection, onToggle, selectedIds]);

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
        <View style={styles.container}>
            <FlatList
                data={items}
                renderItem={({ item }: { item: SelectableItem }) => (
                    <View style={styles.itemWrapper}>
                        {renderItem({ item })}
                    </View>
                )}
                keyExtractor={(item: SelectableItem) => item.id ?? item.name}
                numColumns={2}
                columnWrapperStyle={styles.grid}
                style={styles.scrollContainer}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                ListHeaderComponent={
                    <View style={styles.header}>
                        <AppText variant="title" style={styles.title}>
                            {title}
                        </AppText>
                        <AppText variant="body" color="secondary" style={styles.subtitle}>
                            {subtitle}
                        </AppText>
                    </View>
                }
            />

            {bottomContent && (
                <View style={styles.bottomSection}>
                    {bottomContent}
                </View>
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
        </View>
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
    bottomSection: {
        paddingTop: Spacing.md,
        paddingHorizontal: Spacing.lg,
    },
});
