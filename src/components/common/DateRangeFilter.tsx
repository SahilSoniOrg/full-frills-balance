import { AppText, IvyIcon } from '@/src/components/core';
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
}

export function DateRangeFilter({
    range,
    onPress,
    onPrevious,
    onNext,
    style,
    showNavigationArrows = true
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
                    <IvyIcon name="chevronLeft" size={Size.sm} color={theme.textSecondary} />
                </TouchableOpacity>
            )}

            <TouchableOpacity
                style={[styles.container, { backgroundColor: theme.surface }]}
                onPress={onPress}
                activeOpacity={Opacity.heavy}
            >
                <IvyIcon name="calendar" size={Size.sm} color={theme.primary} />
                <AppText variant="body" style={styles.text}>
                    {range?.label || 'All Time'}
                </AppText>
                <IvyIcon name="chevronDown" size={Size.xs} color={theme.textSecondary} />
            </TouchableOpacity>

            {showNavigation && (
                <TouchableOpacity
                    onPress={onNext}
                    style={[styles.navButton, { backgroundColor: theme.surface }]}
                    activeOpacity={Opacity.heavy}
                >
                    <IvyIcon name="chevronRight" size={Size.sm} color={theme.textSecondary} />
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
        marginBottom: Spacing.md,
    },
    navButton: {
        padding: Spacing.md,
        borderRadius: Shape.radius.md,
        alignItems: 'center',
        justifyContent: 'center',
    },
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        height: Size.xxl,
        paddingHorizontal: Spacing.sm,
        borderRadius: Shape.radius.md,
        gap: Spacing.xs,
    },
    text: {
        fontSize: Typography.sizes.sm,
        fontFamily: Typography.fonts.medium,
    },
});
