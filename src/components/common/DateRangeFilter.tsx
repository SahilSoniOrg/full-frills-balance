import { AppIcon, AppText } from '@/src/components/core';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import { DateRange, formatDate, formatShortDate } from '@/src/utils/dateUtils';
import React, { useMemo } from 'react';
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
    const { theme, fonts } = useTheme();
    const showNavigation = !!(onPrevious && onNext) && showNavigationArrows;

    const displayText = useMemo(() => {
        if (!range) return AppConfig.strings.common.allTime;

        // Check if same day
        const start = new Date(range.startDate);
        const end = new Date(range.endDate);

        if (start.toDateString() === end.toDateString()) {
            return formatDate(start);
        }

        // Use existing label if available (e.g., "This Month", "Last 30 Days")
        if (range.label) return range.label;

        // Fallback for custom ranges without label
        return `${formatShortDate(start)} - ${formatShortDate(end)}`;
    }, [range]);

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
                <AppText variant="body" style={[styles.text, { flexShrink: 1, fontFamily: fonts.medium }]} numberOfLines={1}>
                    {displayText}
                </AppText>
                <AppIcon name="chevronDown" size={Size.xs} color={theme.textSecondary} />
            </TouchableOpacity>

            {/* ... navigation right button ... */}
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
    },
});
