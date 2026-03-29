import { AppIcon, AppText } from '@/src/components/core';
import { IconName } from '@/src/components/core/AppIcon';
import { Opacity, Shape, Size, Spacing, withOpacity } from '@/src/constants';
import { Bleed, Box, Inline } from '@/src/design-system';
import { useTheme } from '@/src/hooks/use-theme';
import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

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
    allowDeselect?: boolean;
}

export const SelectionTileList: React.FC<SelectionTileListProps> = ({
    items,
    selectedId,
    onSelect,
    disabled = false,
    testIDPrefix = 'selection-tile',
    allowDeselect = false,
}) => {
    const { theme } = useTheme();
    const scrollViewRef = React.useRef<ScrollView>(null);
    const itemLayouts = React.useRef<Record<string, { x: number, width: number }>>({});

    const lastScrolledId = React.useRef<string | null>(null);

    const scrollToSelected = React.useCallback((force = false) => {
        if (selectedId && itemLayouts.current[selectedId] && (force || lastScrolledId.current !== selectedId)) {
            const layout = itemLayouts.current[selectedId];
            requestAnimationFrame(() => {
                scrollViewRef.current?.scrollTo({
                    x: Math.max(0, layout.x - Spacing.md),
                    animated: true,
                });
            });
            lastScrolledId.current = selectedId;
        }
    }, [selectedId]);

    React.useEffect(() => {
        // If selectedId changes, we want to try scrolling
        // If layouts aren't ready, this will be called again by onLayout
        scrollToSelected();
    }, [selectedId, scrollToSelected]);

    return (
        <Bleed horizontal="lg">
            <ScrollView
                ref={scrollViewRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scrollContent}
            >
                {items.map((item) => {
                    const isSelected = selectedId === item.id;

                    return (
                        <TouchableOpacity
                            key={item.id}
                            testID={`${testIDPrefix}-${item.id}`}
                            onLayout={(event) => {
                                const isFirstLayout = !itemLayouts.current[item.id];
                                itemLayouts.current[item.id] = event.nativeEvent.layout;
                                if (item.id === selectedId) {
                                    scrollToSelected(isFirstLayout);
                                }
                            }}
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
                            onPress={() => onSelect(isSelected && allowDeselect ? '' : item.id)}
                            disabled={disabled}
                        >
                            <Inline align="center" space="sm">
                                <Box
                                    width={4}
                                    height={Spacing.md}
                                    borderRadius="full"
                                    background={item.color as any}
                                    style={{ opacity: isSelected ? 1 : Opacity.soft }}
                                />
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
                            </Inline>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>
        </Bleed>
    );
};

const styles = StyleSheet.create({
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
        minWidth: 100,
        maxWidth: 240,
    },
});
