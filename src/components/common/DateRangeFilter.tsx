import { AppIcon, AppText } from '@/src/components/core';
import { Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { DateRange } from '@/src/utils/dateUtils';
import React from 'react';
import { StyleProp, StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';

interface DateRangeFilterProps {
    range: DateRange | null;
    onPress: () => void;
    onPrevious?: () => void;
    onNext?: () => void;
    style?: StyleProp<ViewStyle>;
    showNavigationArrows?: boolean;
    fullWidth?: boolean;
}

export function DateRangeFilter({
    range,
    onPress,
    onPrevious,
    onNext,
    style,
    showNavigationArrows = true,
    fullWidth = false
}: DateRangeFilterProps) {
    const { theme } = useTheme();
    const showNavigation = !!(onPrevious && onNext) && showNavigationArrows;

    return (
        <View style={[styles.wrapper, style]}>
            {showNavigation && (
                <TouchableOpacity
                    onPress={onPrevious}
                    style={[styles.navButton, { backgroundColor: theme.surface }]}
                    activeOpacity={Opacity.heavy}
                >
                    <AppIcon name="chevronLeft" size={Size.sm} color={theme.textSecondary} />
                </TouchableOpacity>
            )}

            <TouchableOpacity
                style={[
                    styles.container,
                    { backgroundColor: theme.surface },
                    fullWidth && { flex: 1, justifyContent: 'center' }
                ]}
                onPress={onPress}
                activeOpacity={Opacity.heavy}
            >
                <AppIcon name="calendar" size={Size.sm} color={theme.primary} />
                <AppText variant="body" style={[styles.text, { flexShrink: 1 }]} numberOfLines={1}>
                    {range?.label || 'All Time'}
                </AppText>
                <AppIcon name="chevronDown" size={Size.xs} color={theme.textSecondary} />
            </TouchableOpacity>

            {showNavigation && (
                <TouchableOpacity
                    onPress={onNext}
                    style={[styles.navButton, { backgroundColor: theme.surface }]}
                    activeOpacity={Opacity.heavy}
                >
                    <AppIcon name="chevronRight" size={Size.sm} color={theme.textSecondary} />
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrapper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: Spacing.sm,
    },
    navButton: {
        width: Size.xxl,
        height: Size.xxl,
        borderRadius: Shape.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        height: Size.xxl,
        paddingHorizontal: Spacing.md,
        borderRadius: Shape.radius.md,
        gap: Spacing.sm,
    },
    text: {
        fontSize: Typography.sizes.sm,
        fontFamily: Typography.fonts.medium,
    },
});
