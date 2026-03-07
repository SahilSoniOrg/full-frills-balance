import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';

export interface SelectionTileProps {
    id: string;
    label: string;
    icon?: IconName;
    color: string;
}

export interface SelectionTileListProps {
    items: SelectionTileProps[];
    selectedId: string;
    onSelect: (id: string) => void;
    disabled?: boolean;
    testIDPrefix?: string;
}

export const SelectionTileList: React.FC<SelectionTileListProps> = ({
    items,
    selectedId,
    onSelect,
    disabled = false,
    testIDPrefix = 'selection-tile',
}) => {
    const { theme } = useTheme();

    return (
        <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            style={styles.scrollView}
        >
            {items.map((item) => {
                const isSelected = selectedId === item.id;

                return (
                    <TouchableOpacity
                        key={item.id}
                        testID={`${testIDPrefix}-${item.id}`}
                        style={[
                            styles.tile,
                            {
                                backgroundColor: theme.surface,
                                borderColor: withOpacity(theme.textSecondary, Opacity.muted)
                            },
                            isSelected && {
                                backgroundColor: withOpacity(item.color, Opacity.soft),
                                borderColor: withOpacity(item.color, Opacity.medium)
                            },
                        ]}
                        onPress={() => onSelect(isSelected ? '' : item.id)}
                        disabled={disabled}
                    >
                        <View style={[styles.indicator, { backgroundColor: item.color, opacity: isSelected ? 1 : Opacity.soft }]} />
                        {item.icon && (
                            <AppIcon name={item.icon} size={Size.iconXs} color={item.color} fallbackIcon="wallet" />
                        )}
                        <AppText
                            variant="body"
                            weight={isSelected ? "semibold" : "regular"}
                            style={{ color: theme.text, flexShrink: 1 }}
                            numberOfLines={1}
                            ellipsizeMode="tail"
                        >
                            {item.label}
                        </AppText>
                        {isSelected && (
                            <AppIcon name="checkCircle" size={Size.iconSm} color={item.color} />
                        )}
                    </TouchableOpacity>
                );
            })}
        </ScrollView>
    );
};

const styles = StyleSheet.create({
    scrollView: {
        marginHorizontal: -Spacing.lg, // Bleed to edges
    },
    scrollContent: {
        paddingHorizontal: Spacing.lg,
        gap: Spacing.sm,
        paddingVertical: Spacing.xs,
    },
    tile: {
        paddingHorizontal: Spacing.md,
        paddingVertical: Spacing.sm,
        borderRadius: Shape.radius.r4,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
        minWidth: 100,
        maxWidth: 240,
    },
    indicator: {
        width: 4,
        height: Spacing.md,
        borderRadius: Shape.radius.full,
    },
});
