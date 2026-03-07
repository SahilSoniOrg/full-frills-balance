import { AppIcon } from '@/src/components/core/AppIcon';
import { AppConfig, Opacity, Shape, Size, Spacing, Typography } from '@/src/constants';
import { useTheme } from '@/src/hooks/use-theme';
import React, { useCallback } from 'react';
import {
    Platform,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    UIManager,
    View
} from 'react-native';
import { useExpandableSearch } from './hooks/useExpandableSearch';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ExpandableSearchButtonProps {
    value: string;
    onChangeText: (text: string) => void;
    placeholder?: string;
    onExpandChange?: (isExpanded: boolean) => void;
    /**
     * Optional callback when search button is pressed.
     * 
     * BEHAVIOR MODES:
     * - WITHOUT onPress: Button expands inline to show search input (default)
     * - WITH onPress: Button navigates/triggers action instead of expanding
     * 
     * Use onPress when you want the search button to navigate to a dedicated
     * search screen rather than expanding inline.
     */
    onPress?: () => void;
}

/**
 * ExpandableSearchButton - A search icon with two behavior modes
 * 
 * MODE 1 (default): Inline expansion
 * - Collapsed: Shows only the search icon
 * - On tap: Expands to full search input with clear button
 * - Use when: Search should happen in-place
 * 
 * MODE 2 (with onPress): Navigation
 * - Collapsed: Shows only the search icon
 * - On tap: Calls onPress (typically for navigation)
 * - Use when: Search should open a dedicated screen
 */
export const ExpandableSearchButton = ({
    value,
    onChangeText,
    placeholder = AppConfig.strings.common.searchPlaceholder,
    onExpandChange,
    onPress,
}: ExpandableSearchButtonProps) => {
    const { theme } = useTheme();
    const {
        isExpanded,
        handleExpand,
        handleCollapse,
        handleClear,
        inputRef
    } = useExpandableSearch({ value, onChangeText, onExpandChange });

    const handlePress = useCallback(() => {
        if (onPress) {
            // Navigation mode: trigger callback instead of expanding
            onPress();
        } else {
            // Inline mode: expand to show search input
            handleExpand();
        }
    }, [onPress, handleExpand]);

    if (!isExpanded) {
        return (
            <TouchableOpacity
                onPress={handlePress}
                style={[
                    styles.iconButton,
                    { backgroundColor: theme.surface },
                    Shape.elevation.sm
                ]}
                activeOpacity={Opacity.heavy}
            >
                <AppIcon name="search" size={Size.sm} color={theme.text} />
            </TouchableOpacity>
        );
    }

    return (
        <View
            style={[
                styles.expandedContainer,
                {
                    backgroundColor: theme.surface,
                    borderColor: theme.border,
                },
                Shape.elevation.sm
            ]}
        >
            <AppIcon name="search" size={Size.sm} color={theme.textSecondary} style={styles.icon} />
            <TextInput
                ref={inputRef}
                style={[styles.input, { color: theme.text }]}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={theme.textTertiary}
                selectionColor={theme.primary}
                autoFocus
            />
            <TouchableOpacity onPress={value.length > 0 ? handleClear : handleCollapse} style={styles.clearButton}>
                <AppIcon name="close" size={Size.sm} color={theme.textSecondary} />
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    iconButton: {
        width: Size.xl,
        height: Size.xl,
        borderRadius: Shape.radius.full,
        alignItems: 'center',
        justifyContent: 'center',
    },
    expandedContainer: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        height: Size.xl,
        minHeight: Size.xl,
        borderRadius: Shape.radius.full,
        paddingHorizontal: Spacing.md,
        gap: Spacing.sm,
    },
    icon: {},
    input: {
        flex: 1,
        fontSize: Typography.sizes.base,
        height: '100%',
        paddingHorizontal: 0,
        paddingVertical: 0,
        textAlignVertical: 'center',
        includeFontPadding: false,
    },
    clearButton: {
        alignItems: 'center',
        justifyContent: 'center',
    },
});
